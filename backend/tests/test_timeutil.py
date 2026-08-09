"""DB 타임스탬프(UTC) → 표시용 KST 변환 유틸 테스트."""
from datetime import datetime, timezone

from app import timeutil


class TestParseDbTimestamp:
    def test_naive_string_is_utc(self):
        # SQLite datetime('now')는 UTC naive 문자열
        assert timeutil.parse_db_timestamp("2026-07-24 01:46:07") == datetime(
            2026, 7, 24, 1, 46, 7, tzinfo=timezone.utc
        )

    def test_keeps_existing_offset(self):
        # 네이버 뉴스 pub_date처럼 오프셋이 있는 값은 그대로 유지
        parsed = timeutil.parse_db_timestamp("2026-07-24T10:46:07+09:00")
        assert parsed.utcoffset().total_seconds() == 9 * 3600

    def test_none_returns_none(self):
        assert timeutil.parse_db_timestamp(None) is None

    def test_invalid_returns_none(self):
        assert timeutil.parse_db_timestamp("not-a-date") is None


class TestToKstIso:
    def test_utc_string_converted_to_kst(self):
        assert timeutil.to_kst_iso("2026-07-24 01:46:07") == "2026-07-24T10:46:07+09:00"

    def test_already_kst_is_idempotent(self):
        once = timeutil.to_kst_iso("2026-07-24 01:46:07")
        assert timeutil.to_kst_iso(once) == once

    def test_none_returns_none(self):
        assert timeutil.to_kst_iso(None) is None

    def test_unparsable_keeps_original(self):
        assert timeutil.to_kst_iso("알 수 없음") == "알 수 없음"


# --- 장 시간 판정 -------------------------------------------------------------

def test_is_market_hours_weekday_and_boundaries():
    """평일 09:00~15:40이 장중. 경계 포함."""
    assert timeutil.is_market_hours(datetime(2026, 8, 7, 9, 0, tzinfo=timeutil.KST))
    assert timeutil.is_market_hours(datetime(2026, 8, 7, 15, 40, tzinfo=timeutil.KST))
    assert not timeutil.is_market_hours(datetime(2026, 8, 7, 8, 59, tzinfo=timeutil.KST))
    assert not timeutil.is_market_hours(datetime(2026, 8, 7, 15, 41, tzinfo=timeutil.KST))


def test_is_market_hours_weekend():
    assert not timeutil.is_market_hours(datetime(2026, 8, 8, 11, 0, tzinfo=timeutil.KST))
    assert not timeutil.is_market_hours(datetime(2026, 8, 9, 11, 0, tzinfo=timeutil.KST))


def test_is_close_confirmed_is_inverse_of_market_hours():
    """종가 확정 = 장중이 아님. 실시간 스냅샷을 종가로 저장해도 되는지의 기준."""
    intraday = datetime(2026, 8, 7, 10, 6, tzinfo=timeutil.KST)
    after = datetime(2026, 8, 7, 15, 41, tzinfo=timeutil.KST)
    assert timeutil.is_close_confirmed(intraday) is False
    assert timeutil.is_close_confirmed(after) is True


def test_market_hours_converts_other_timezones_to_kst():
    """KST가 아닌 시각도 KST로 환산해 판정한다."""
    # 2026-08-07 01:00 UTC = 10:00 KST(장중)
    utc_intraday = datetime(2026, 8, 7, 1, 0, tzinfo=timezone.utc)
    assert timeutil.is_market_hours(utc_intraday)
