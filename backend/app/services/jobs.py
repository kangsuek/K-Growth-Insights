"""전체 수집(collect-all) 실행 및 진행률 추적.

수집은 종목 단위로 병렬 실행(네트워크 I/O 위주)해 시간을 단축한다. 진행 상태는
인메모리로 공유하며, 수집이 진행되는 동안 다른 스레드(진행률 폴링)가 읽을 수 있다.
collect_all_sync는 수집을 동기로 끝까지 수행하고 집계 결과를 반환한다.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from app import config
from app.models import CollectResult
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


def _collect_one(ticker: str) -> CollectResult:
    """종목 하나를 수집하고 진행 상태를 스레드 안전하게 갱신."""
    with _lock:
        _state["current"] = ticker
    result = collectors.collect_stock(ticker)
    with _lock:
        _state["completed"] += 1
        _state["succeeded" if result.ok else "failed"] += 1
    return result


def _aggregate(results: list[CollectResult], total_tickers: int) -> dict:
    """프론트 계약용 수집 집계."""
    fundamentals_success = sum(1 for r in results if r.fundamentals)
    return {
        "total_tickers": total_tickers,
        "total_price_records": sum(r.prices for r in results),
        "total_trading_flow_records": sum(r.trading_flow for r in results),
        "total_news_records": sum(r.news for r in results),
        "fundamentals_success": fundamentals_success,
        "fundamentals_failed": total_tickers - fundamentals_success,
    }


def collect_all_sync() -> dict:
    """전체 종목을 병렬 수집하고 집계 결과를 반환(동기).

    진행 상태(_state)를 갱신하므로 /collect-progress 폴링으로 실시간 진행을 볼 수 있다.
    """
    stocks = repository.list_stocks()
    with _lock:
        _state.update(
            status="running", total=len(stocks), completed=0, succeeded=0,
            failed=0, current=None, started_at=_now(), finished_at=None,
        )
    workers = max(1, min(config.COLLECT_CONCURRENCY, len(stocks) or 1))
    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(lambda s: _collect_one(s["ticker"]), stocks))
        with _lock:
            _state.update(status="done", current=None, finished_at=_now())
        logger.info(
            "[collect-all] 완료 %d/%d (병렬 %d)",
            _state["succeeded"], _state["total"], workers,
        )
        return _aggregate(results, len(stocks))
    except Exception as exc:  # noqa: BLE001 - 상태에 기록 후 재발생
        logger.error("[collect-all] 실패: %s", exc, exc_info=True)
        with _lock:
            _state.update(status="error", current=None, finished_at=_now())
        raise
