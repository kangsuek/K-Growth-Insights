"""API 키(네이버 검색 등) 저장·조회·런타임 적용.

키는 backend/data/api_keys.json에 저장하고, 저장 시 os.environ과 config 모듈
속성에 즉시 반영해 실행 중인 서비스(naver_client)가 바로 사용하도록 한다.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from app import config

logger = logging.getLogger(__name__)

_KEYS_PATH = Path(config.DATA_DIR) / "api_keys.json"
_MANAGED = ("NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "PERPLEXITY_API_KEY")


def _load() -> dict:
    if not _KEYS_PATH.exists():
        return {}
    try:
        with _KEYS_PATH.open(encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def _save(keys: dict) -> None:
    _KEYS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _KEYS_PATH.open("w", encoding="utf-8") as fh:
        json.dump(keys, fh, ensure_ascii=False, indent=2)


def _apply(key: str, value: str) -> None:
    """런타임 반영: 환경변수 + config 모듈 속성."""
    os.environ[key] = value
    if key == "NAVER_CLIENT_ID":
        config.NAVER_CLIENT_ID = value
    elif key == "NAVER_CLIENT_SECRET":
        config.NAVER_CLIENT_SECRET = value


def load_to_runtime() -> None:
    """저장된 키를 기동 시 런타임에 적용한다."""
    for key, value in _load().items():
        if value and not value.startswith("your_"):
            _apply(key, value)


def _mask(value: str) -> str:
    return value[:4] + "*" * max(0, len(value) - 4) if value else ""


def get_keys(raw: bool = False) -> dict:
    """저장/환경의 키를 마스킹(raw=False) 또는 원본(raw=True)으로 반환."""
    stored = _load()
    result: dict[str, str] = {}
    for key in _MANAGED:
        value = stored.get(key) or os.getenv(key, "") or ""
        if value and not value.startswith("your_"):
            result[key] = value if raw else _mask(value)
        else:
            result[key] = ""
    return {
        "keys": result,
        "configured": {
            "naver": bool(result["NAVER_CLIENT_ID"] and result["NAVER_CLIENT_SECRET"]),
        },
    }


def update_keys(data: dict) -> dict:
    """제공된 키만 갱신·저장·런타임 반영. 마스킹된 현황 반환."""
    keys = _load()
    for key, value in data.items():
        if key in _MANAGED and value is not None:
            keys[key] = value
            if value and not value.startswith("your_"):
                _apply(key, value)
    _save(keys)
    return get_keys(raw=False)
