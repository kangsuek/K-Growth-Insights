"""이식 Phase 1 백엔드 계약 테스트: market·etfs·data 확장."""
import httpx
import respx
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import naver_client
from tests.conftest import seed_stock

client = TestClient(app)


def _seed_prices(ticker, closes):
    with get_connection() as conn:
        for i, c in enumerate(closes):
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES (?, ?, ?, ?, ?, ?, 1000, 0.5)""",
                (ticker, f"2026-07-{i + 1:02d}", c, c, c, c),
            )


# --- market ------------------------------------------------------------------

@respx.mock
def test_market_overview_returns_indices():
    for code in ("KOSPI", "KOSDAQ"):
        respx.get(f"{naver_client.MINDEX_BASE}/{code}/basic").mock(
            return_value=httpx.Response(
                200,
                json={
                    "closePrice": "7,116.14",
                    "compareToPreviousClosePrice": "368.19",
                    "fluctuationsRatio": "5.46",
                },
            )
        )
    body = client.get("/api/market/overview").json()
    names = {i["name"] for i in body["indices"]}
    assert names == {"코스피", "코스닥"}
    assert body["indices"][0]["close_price"] == 7116.14


@respx.mock
def test_index_chart_shape():
    respx.get(f"{naver_client.MINDEX_BASE}/KOSPI/price").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"localTradedAt": "2026-07-21", "closePrice": "7,100", "openPrice": "7,000",
                 "highPrice": "7,150", "lowPrice": "6,990", "accumulatedTradingVolume": "0"},
            ],
        )
    )
    body = client.get("/api/market/index/KOSPI/chart?period=1M").json()
    assert body["code"] == "KOSPI"
    assert body["data"][0]["close"] == 7100.0
    assert "open" in body["data"][0]


def test_index_chart_unknown_code_empty():
    body = client.get("/api/market/index/NASDAQ/chart").json()
    assert body["data"] == []


# --- etfs --------------------------------------------------------------------

def test_list_etfs_shape():
    seed_stock("005930", "삼성전자", "STOCK", theme="반도체")
    rows = client.get("/api/etfs/").json()
    assert rows[0]["ticker"] == "005930"
    assert rows[0]["theme"] == "반도체"
    assert "purchase_price" in rows[0]  # ETF 카드 계약 필드 존재


def test_batch_summary_computes_weekly_return():
    seed_stock("005930", "삼성전자", "STOCK")
    # 최신이 100, 6거래일 전이 100 → 주간수익률 계산 가능
    _seed_prices("005930", [95, 96, 97, 98, 99, 100, 110])  # 오래된→최신
    r = client.post(
        "/api/etfs/batch-summary",
        json={"tickers": ["005930"], "price_days": 14, "news_limit": 3},
    ).json()
    s = r["data"]["005930"]
    assert s["latest_price"]["close_price"] == 110  # 최신
    # prices는 최신→오래된 순: [110,100,99,98,97,96,95]
    assert s["prices"][0]["close_price"] == 110
    # weekly_return = 최신 / 약 5거래일 전(prices_desc[5]=96)
    assert round(s["weekly_return"], 1) == round((110 / 96 - 1) * 100, 1)


def test_etf_detail_404_for_unknown():
    assert client.get("/api/etfs/999999").status_code == 404


# --- data 확장 ---------------------------------------------------------------

def test_scheduler_status_shape():
    body = client.get("/api/data/scheduler-status").json()
    assert "scheduler" in body
    assert "last_collection_time" in body["scheduler"]


def test_reset_clears_collected_data():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_prices("005930", [100, 101])
    r = client.delete("/api/data/reset").json()
    assert r["reset"] is True
    with get_connection() as conn:
        n = conn.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
        s = conn.execute("SELECT COUNT(*) FROM stocks").fetchone()[0]
    assert n == 0      # 시세 삭제됨
    assert s == 1      # 종목 목록은 보존


def test_etf_prices_returned_newest_first():
    """상세 prices는 원본과 동일하게 최신순(DESC)."""
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_prices("005930", [100, 101, 102])  # 07-01, 07-02, 07-03
    rows = client.get("/api/etfs/005930/prices?days=10").json()
    assert rows[0]["date"] == "2026-07-03"   # 최신이 먼저
    assert rows[-1]["date"] == "2026-07-01"


def test_etf_fundamentals_holdings_field_mapping():
    """구성종목은 프론트 계약(stock_code/stock_name/daily_change_pct)으로 매핑."""
    seed_stock("487240", "KODEX ETF", "ETF")
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO etf_holdings (ticker, seq, item_code, item_name, weight) VALUES (?,?,?,?,?)",
            ("487240", 1, "005930", "삼성전자", 20.5),
        )
    body = client.get("/api/etfs/487240/fundamentals").json()
    h = body["holdings"][0]
    assert h["stock_code"] == "005930"
    assert h["stock_name"] == "삼성전자"
    assert h["weight"] == 20.5
    assert "daily_change_pct" in h
