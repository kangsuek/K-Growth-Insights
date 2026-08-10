"""스케줄러 등 앱 전역 설정 저장·조회·런타임 적용.

api_keys.py와 동일한 패턴: DB와 같은 디렉터리(config.APP_DATA_DIR)의 JSON 파일에
저장하고, 저장 시 config 모듈 속성에 즉시 반영해 실행 중인 스케줄러가 바로
새 주기를 쓰도록 한다.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from app import config
from app.services import scheduler

logger = logging.getLogger(__name__)

_SETTINGS_PATH = Path(config.APP_DATA_DIR) / "app_settings.json"

MIN_INTRADAY_MINUTES = 1
MAX_INTRADAY_MINUTES = 30

MIN_COLLECT_MINUTES = 1
MAX_COLLECT_MINUTES = 60


def _load() -> dict:
    if not _SETTINGS_PATH.exists():
        return {}
    try:
        with _SETTINGS_PATH.open(encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def _save(data: dict) -> None:
    _SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _SETTINGS_PATH.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def load_to_runtime() -> None:
    """저장된 설정을 기동 시 config에 반영한다(스케줄러 시작 전에 호출)."""
    data = _load()
    intraday = data.get("intraday_collect_interval_minutes")
    if isinstance(intraday, int) and MIN_INTRADAY_MINUTES <= intraday <= MAX_INTRADAY_MINUTES:
        config.INTRADAY_COLLECT_INTERVAL_MINUTES = intraday
    collect = data.get("collect_interval_minutes")
    if isinstance(collect, int) and MIN_COLLECT_MINUTES <= collect <= MAX_COLLECT_MINUTES:
        config.COLLECT_INTERVAL_MINUTES = collect


def get_scheduler_settings() -> dict:
    return {
        "intraday_collect_interval_minutes": config.INTRADAY_COLLECT_INTERVAL_MINUTES,
        "intraday_min_minutes": MIN_INTRADAY_MINUTES,
        "intraday_max_minutes": MAX_INTRADAY_MINUTES,
        "collect_interval_minutes": config.COLLECT_INTERVAL_MINUTES,
        "collect_min_minutes": MIN_COLLECT_MINUTES,
        "collect_max_minutes": MAX_COLLECT_MINUTES,
    }


def update_scheduler_settings(
    intraday_collect_interval_minutes: int | None = None,
    collect_interval_minutes: int | None = None,
) -> dict:
    """스케줄러 주기를 저장·런타임 반영하고, 실행 중인 잡을 즉시 재등록한다.

    제공된 값만 갱신한다(둘 다 줘도 되고, 하나만 줘도 된다).
    """
    if intraday_collect_interval_minutes is not None and not (
        MIN_INTRADAY_MINUTES <= intraday_collect_interval_minutes <= MAX_INTRADAY_MINUTES
    ):
        raise ValueError(
            f"분봉 수집 주기는 {MIN_INTRADAY_MINUTES}~{MAX_INTRADAY_MINUTES}분 사이여야 합니다"
        )
    if collect_interval_minutes is not None and not (
        MIN_COLLECT_MINUTES <= collect_interval_minutes <= MAX_COLLECT_MINUTES
    ):
        raise ValueError(
            f"데이터 자동 수집 주기는 {MIN_COLLECT_MINUTES}~{MAX_COLLECT_MINUTES}분 사이여야 합니다"
        )

    data = _load()
    if intraday_collect_interval_minutes is not None:
        data["intraday_collect_interval_minutes"] = intraday_collect_interval_minutes
    if collect_interval_minutes is not None:
        data["collect_interval_minutes"] = collect_interval_minutes
    _save(data)

    if intraday_collect_interval_minutes is not None:
        scheduler.update_intraday_interval(intraday_collect_interval_minutes)
        logger.info("분봉 수집 주기 변경: %d분", intraday_collect_interval_minutes)
    if collect_interval_minutes is not None:
        scheduler.update_collect_interval(collect_interval_minutes)
        logger.info("데이터 자동 수집 주기 변경: %d분", collect_interval_minutes)

    return get_scheduler_settings()
