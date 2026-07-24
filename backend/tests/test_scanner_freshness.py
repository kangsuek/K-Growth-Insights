"""종목 발굴 수집 freshness 가드 테스트 — 장마감/장중 판정과 force 동작.

catalog_updated_at은 SQLite `datetime('now')`(UTC)로 저장되므로 시드도 UTC 기준이다.
"""
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import scanner

client = TestClient(app)

KST = ZoneInfo("Asia/Seoul")


def _kst(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=KST)


def _seed_updated_at(value: str | None):
    """catalog_updated_at(UTC 문자열)만 채운 카탈로그 1건 시드."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO stock_catalog (ticker, name, type, market, is_active, catalog_updated_at) "
            "VALUES ('069500', 'KODEX 200', 'ETF', 'KOSPI', 1, ?)",
            (value,),
        )


class TestLastMarketClose:
    """가장 최근 장 마감(확정) 시각 계산 (기준 15:40 KST)."""

    def test_weekday_after_close_returns_today(self):
        # 월요일 16:00 → 오늘 15:40
        assert scanner._last_market_close(_kst(2026, 7, 20, 16, 0)) == _kst(2026, 7, 20, 15, 40)

    def test_weekday_during_market_returns_prev_trading_day(self):
        # 월요일 11:00 → 직전 거래일 금요일(7/17) 15:40
        assert scanner._last_market_close(_kst(2026, 7, 20, 11, 0)) == _kst(2026, 7, 17, 15, 40)

    def test_sunday_returns_friday(self):
        assert scanner._last_market_close(_kst(2026, 7, 19, 12, 0)) == _kst(2026, 7, 17, 15, 40)

    def test_saturday_returns_friday(self):
        assert scanner._last_market_close(_kst(2026, 7, 18, 12, 0)) == _kst(2026, 7, 17, 15, 40)


class TestParseDbTimestamp:
    def test_parses_sqlite_utc_string(self):
        assert scanner._parse_db_timestamp("2026-07-20 07:10:00") == datetime(
            2026, 7, 20, 7, 10, tzinfo=ZoneInfo("UTC")
        )

    def test_none_returns_none(self):
        assert scanner._parse_db_timestamp(None) is None

    def test_invalid_returns_none(self):
        assert scanner._parse_db_timestamp("not-a-date") is None


class TestCheckFreshness:
    def test_no_history_is_stale(self):
        result = scanner.check_freshness(now=_kst(2026, 7, 20, 17, 0))
        assert result == {"fresh": False, "last_updated": None}

    def test_after_close_with_todays_data_is_fresh(self):
        # now: 월 17:00(마감후), 수집: 월 16:10 KST(=07:10 UTC) → 오늘 마감분 확보
        _seed_updated_at("2026-07-20 07:10:00")
        result = scanner.check_freshness(now=_kst(2026, 7, 20, 17, 0))
        assert result["fresh"] is True
        assert result["last_updated"] == "2026-07-20T16:10:00"  # KST로 환산해 반환

    def test_after_close_with_stale_data_is_stale(self):
        # now: 월 17:00, 수집: 일 18:55 KST(월 마감 이전) → stale
        _seed_updated_at("2026-07-19 09:55:00")
        assert scanner.check_freshness(now=_kst(2026, 7, 20, 17, 0))["fresh"] is False

    def test_market_hours_within_ttl_is_fresh(self):
        # now: 월 11:00(장중), 수집: 월 10:30 KST(30분 전, TTL 6h 이내)
        _seed_updated_at("2026-07-20 01:30:00")
        assert scanner.check_freshness(now=_kst(2026, 7, 20, 11, 0))["fresh"] is True

    def test_market_hours_beyond_ttl_is_stale(self):
        # now: 월 15:00(장중), 수집: 월 03:00 KST(12h 전, TTL 6h 초과)
        _seed_updated_at("2026-07-19 18:00:00")
        assert scanner.check_freshness(now=_kst(2026, 7, 20, 15, 0))["fresh"] is False


class TestCollectDataEndpoint:
    """POST /api/scanner/collect-data 의 force / fresh-skip 동작."""

    def test_fresh_skips_without_starting_collection(self):
        with patch.object(scanner, "check_freshness",
                          return_value={"fresh": True, "last_updated": "2026-07-20T16:10:00"}), \
             patch.object(scanner, "collect_catalog_data") as collect:
            body = client.post("/api/scanner/collect-data").json()
        assert body["status"] == "fresh"
        assert body["skipped"] is True
        assert body["last_updated"] == "2026-07-20T16:10:00"
        collect.assert_not_called()

    def test_force_bypasses_freshness(self):
        with patch.object(scanner, "check_freshness") as fresh, \
             patch.object(scanner, "collect_catalog_data"):
            body = client.post("/api/scanner/collect-data", params={"force": "true"}).json()
        assert body["status"] == "started"
        fresh.assert_not_called()  # force면 freshness 확인 자체를 건너뛴다

    def test_stale_starts_collection(self):
        with patch.object(scanner, "check_freshness",
                          return_value={"fresh": False, "last_updated": None}), \
             patch.object(scanner, "collect_catalog_data") as collect:
            body = client.post("/api/scanner/collect-data").json()
        assert body["status"] == "started"
        collect.assert_called_once()
