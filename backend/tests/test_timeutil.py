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
