"""DB 타임스탬프(UTC) → 표시용 KST 변환, 장 시간 판정 유틸.

SQLite `datetime('now')`는 **UTC** 기준 naive 문자열('YYYY-MM-DD HH:MM:SS')로 저장된다.
프론트는 이 값을 `new Date()`로 파싱해 로컬 시각으로 표시하므로, 그대로 내보내면
9시간 어긋난 시각이 보인다. API 경계에서 KST 오프셋(+09:00)이 붙은 ISO8601로
변환해 내보내고, DB 저장 규약(UTC)은 그대로 둔다.

장 개장/마감 시각은 스케줄러·발굴 수집·카탈로그 수집 세 곳에서 각각 정의돼 있었다.
'종가가 확정됐는가'를 판단하는 기준이 갈라지면 화면 값의 기준일이 어긋나므로 여기 모은다.
"""
from __future__ import annotations

from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")

MARKET_OPEN = time(9, 0)
MARKET_CLOSE = time(15, 40)   # 종가 확정 시각


def is_market_hours(now: datetime | None = None) -> bool:
    """평일 정규장 시간(09:00~15:40 KST) 여부."""
    now = (now or datetime.now(KST)).astimezone(KST)
    if now.weekday() >= 5:  # 5=토, 6=일
        return False
    return MARKET_OPEN <= now.time() <= MARKET_CLOSE


def is_close_confirmed(now: datetime | None = None) -> bool:
    """종가가 확정된 시점인지. 장중이면 False.

    네이버 실시간 스냅샷(marketValue)을 종가로 저장해도 되는지 판단하는 데 쓴다.
    휴장일(공휴일)은 달력이 없어 장중으로 보수적으로 판정될 수 있는데, 그 경우
    스냅샷을 덮어쓰지 않고 기존 확정값을 유지하므로 값이 틀어지지는 않는다.
    """
    return not is_market_hours(now)


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
