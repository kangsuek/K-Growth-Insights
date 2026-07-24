"""DB 타임스탬프(UTC) → 표시용 KST 변환 유틸.

SQLite `datetime('now')`는 **UTC** 기준 naive 문자열('YYYY-MM-DD HH:MM:SS')로 저장된다.
프론트는 이 값을 `new Date()`로 파싱해 로컬 시각으로 표시하므로, 그대로 내보내면
9시간 어긋난 시각이 보인다. API 경계에서 KST 오프셋(+09:00)이 붙은 ISO8601로
변환해 내보내고, DB 저장 규약(UTC)은 그대로 둔다.
"""
from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")


def parse_db_timestamp(value) -> datetime | None:
    """DB 타임스탬프를 aware datetime으로 파싱. 실패하면 None.

    오프셋이 없는 값은 UTC(SQLite `datetime('now')` 규약)로 간주한다.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace(" ", "T").split(".")[0])
        except ValueError:
            return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def to_kst_iso(value) -> str | None:
    """DB 타임스탬프를 KST ISO8601(+09:00)로 변환. 파싱 불가면 원문을 그대로 둔다."""
    parsed = parse_db_timestamp(value)
    if parsed is None:
        return value if isinstance(value, str) else None
    return parsed.astimezone(KST).isoformat()
