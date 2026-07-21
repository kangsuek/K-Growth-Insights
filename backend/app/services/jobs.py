"""전체 수집(collect-all) 백그라운드 실행 및 진행률 추적.

SQLite 전용·단일 프로세스 구성에 맞춰 상태는 인메모리로 관리하고, 수집은
데몬 스레드에서 실행해 요청을 막지 않는다. 프론트는 /collect-status를 폴링한다.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime

from app.services import collectors, repository

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_state: dict = {
    "status": "idle",       # idle | running | done | error
    "total": 0,
    "completed": 0,
    "succeeded": 0,
    "failed": 0,
    "current": None,        # 수집 중인 ticker
    "started_at": None,
    "finished_at": None,
}


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def snapshot() -> dict:
    """현재 진행 상태 사본."""
    with _lock:
        return dict(_state)


def is_running() -> bool:
    with _lock:
        return _state["status"] == "running"


def start() -> bool:
    """수집을 백그라운드로 시작한다. 이미 실행 중이면 False."""
    stocks = repository.list_stocks()
    with _lock:
        if _state["status"] == "running":
            return False
        _state.update(
            status="running", total=len(stocks), completed=0, succeeded=0,
            failed=0, current=None, started_at=_now(), finished_at=None,
        )
    threading.Thread(target=_run, args=(stocks,), daemon=True).start()
    return True


def _run(stocks: list[dict]) -> None:
    try:
        for s in stocks:
            with _lock:
                _state["current"] = s["ticker"]
            result = collectors.collect_stock(s["ticker"])
            with _lock:
                _state["completed"] += 1
                _state["succeeded" if result.ok else "failed"] += 1
        with _lock:
            _state.update(status="done", current=None, finished_at=_now())
        logger.info("[collect-all] 완료 %d/%d", _state["succeeded"], _state["total"])
    except Exception as exc:  # noqa: BLE001 - 상태에 기록하고 스레드 종료
        logger.error("[collect-all] 실패: %s", exc, exc_info=True)
        with _lock:
            _state.update(status="error", current=None, finished_at=_now())
