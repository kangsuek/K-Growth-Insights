"""Phase 4(종목 발굴) 테스트: 검색·필터·정렬·테마·추천 — stock_catalog 기반."""
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import scanner
from tests.conftest import seed_stock

client = TestClient(app)


def _seed_catalog(rows):
    """(ticker, name, type, market, sector, weekly, volume, foreign_net) 시드."""
    with get_connection() as conn:
        for t, name, ty, mkt, sector, wr, vol, fn in rows:
            conn.execute(
                """INSERT INTO stock_catalog
                   (ticker, name, type, market, sector, is_active, close_price,
                    weekly_return, volume, foreign_net, catalog_updated_at)
                   VALUES (?, ?, ?, ?, ?, 1, 1000, ?, ?, ?, '2026-07-22 09:00:00')""",
                (t, name, ty, mkt, sector, wr, vol, fn),
            )


def test_search_filters_sorts_paginates():
    _seed_catalog([
        ("069500", "KODEX 200", "ETF", "KOSPI", "지수", 5.0, 1000, 100),
        ("487240", "KODEX AI", "ETF", "KOSPI", "AI", 12.0, 500, -50),
        ("305720", "KODEX 2차전지", "ETF", "KOSPI", "2차전지", 8.0, 2000, 300),
    ])
    body = client.get("/api/scanner", params={"type": "ETF", "sort_by": "weekly_return"}).json()
    assert body["total"] == 3
    # weekly_return 내림차순
    assert [i["ticker"] for i in body["items"]] == ["487240", "305720", "069500"]
    assert "is_registered" in body["items"][0]


def test_search_foreign_positive_filter():
    _seed_catalog([
        ("069500", "KODEX 200", "ETF", "KOSPI", "지수", 5.0, 1000, 100),
        ("487240", "KODEX AI", "ETF", "KOSPI", "AI", 12.0, 500, -50),
    ])
    body = client.get("/api/scanner", params={"foreign_net_positive": "true"}).json()
    assert {i["ticker"] for i in body["items"]} == {"069500"}


def test_search_is_registered_marks_watchlist():
    seed_stock("069500", "KODEX 200", "ETF")  # 워치리스트 등록
    _seed_catalog([("069500", "KODEX 200", "ETF", "KOSPI", "지수", 5.0, 1000, 100)])
    body = client.get("/api/scanner", params={"type": "ETF"}).json()
    assert body["items"][0]["is_registered"] is True


def test_themes_group_by_sector():
    _seed_catalog([
        ("069500", "KODEX 200", "ETF", "KOSPI", "지수", 5.0, 1000, 100),
        ("487240", "KODEX AI", "ETF", "KOSPI", "AI", 12.0, 500, -50),
        ("305720", "KODEX 2차", "ETF", "KOSPI", "AI", 8.0, 2000, 300),
    ])
    body = client.get("/api/scanner/themes").json()
    ai = next(t for t in body if t["sector"] == "AI")
    assert ai["count"] == 2
    assert len(ai["top_performers"]) == 2


def test_recommendations_presets():
    _seed_catalog([
        ("069500", "KODEX 200", "ETF", "KOSPI", "지수", 5.0, 1000, 100),
        ("487240", "KODEX AI", "ETF", "KOSPI", "AI", 12.0, 500, -50),
    ])
    body = client.get("/api/scanner/recommendations").json()
    ids = {p["preset_id"] for p in body}
    assert "weekly_top_return" in ids and "foreign_buying" in ids
    top = next(p for p in body if p["preset_id"] == "weekly_top_return")
    assert top["items"][0]["ticker"] == "487240"  # 주간수익률 최고


def test_collect_progress_idle_default():
    body = client.get("/api/scanner/collect-progress").json()
    assert "status" in body


def test_supply_targets_selects_top_n_and_all_etf(monkeypatch):
    # 딥수집 대상: 전체 ETF + KOSPI 시총 상위 N + KOSDAQ 시총 상위 N
    monkeypatch.setattr(scanner, "KOSPI_TOP_N_SUPPLY", 2)
    monkeypatch.setattr(scanner, "KOSDAQ_TOP_N_SUPPLY", 1)
    with get_connection() as conn:
        def ins(ticker, ty, mkt, mv):
            conn.execute(
                "INSERT INTO stock_catalog (ticker, name, type, market, is_active, market_value) "
                "VALUES (?, ?, ?, ?, 1, ?)", (ticker, ticker, ty, mkt, mv))
        # ETF 2개(시총 무관 전부 포함)
        ins("069500", "ETF", "ETF", 10); ins("487240", "ETF", "ETF", 5)
        # KOSPI 3개 → 상위 2개(시총 300, 200)만
        ins("005930", "STOCK", "KOSPI", 300); ins("000660", "STOCK", "KOSPI", 200)
        ins("111111", "STOCK", "KOSPI", 100)
        # KOSDAQ 2개 → 상위 1개(시총 90)만
        ins("196170", "STOCK", "KOSDAQ", 90); ins("222222", "STOCK", "KOSDAQ", 10)
    with get_connection() as conn:
        targets = set(scanner._supply_targets(conn))
    assert targets == {"069500", "487240", "005930", "000660", "196170"}
    assert "111111" not in targets  # KOSPI 상위 N 밖
    assert "222222" not in targets  # KOSDAQ 상위 N 밖
