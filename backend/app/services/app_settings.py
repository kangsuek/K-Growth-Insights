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
    minutes = _load().get("intraday_collect_interval_minutes")
    if isinstance(minutes, int) and MIN_INTRADAY_MINUTES <= minutes <= MAX_INTRADAY_MINUTES:
        config.INTRADAY_COLLECT_INTERVAL_MINUTES = minutes


def get_scheduler_settings() -> dict:
    return {
        "intraday_collect_interval_minutes": config.INTRADAY_COLLECT_INTERVAL_MINUTES,
        "min_minutes": MIN_INTRADAY_MINUTES,
        "max_minutes": MAX_INTRADAY_MINUTES,
    }


def update_scheduler_settings(intraday_collect_interval_minutes: int) -> dict:
    """분봉 수집 주기를 저장·런타임 반영하고, 실행 중인 스케줄러 잡을 즉시 재등록한다."""
    if not (MIN_INTRADAY_MINUTES <= intraday_collect_interval_minutes <= MAX_INTRADAY_MINUTES):
        raise ValueError(
            f"분봉 수집 주기는 {MIN_INTRADAY_MINUTES}~{MAX_INTRADAY_MINUTES}분 사이여야 합니다"
        )
    data = _load()
    data["intraday_collect_interval_minutes"] = intraday_collect_interval_minutes
    _save(data)
    scheduler.update_intraday_interval(intraday_collect_interval_minutes)
    logger.info("분봉 수집 주기 변경: %d분", intraday_collect_interval_minutes)
    return get_scheduler_settings()
