"""카탈로그(종목발굴 유니버스) 수집 테스트: stock_catalog 적재. 워치리스트와 분리."""
import httpx
import respx
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import catalog, naver_client

client = TestClient(app)


def _catalog_url(market):
    return f"{naver_client.MSTOCKS_BASE}/marketValue/{market}"


def _page(codes):
    return {
        "stocks": [
            {"itemCode": c, "stockName": n, "stockEndType": t} for c, n, t in codes
        ]
    }


@respx.mock
def test_sync_catalog_populates_catalog_not_watchlist():
    # 워치리스트(stocks)에 관심종목 1개 등록
    from tests.conftest import seed_stock
    seed_stock("005930", "삼성전자", "STOCK", theme="반도체")

    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(
            200,
            json=_page([
                ("005930", "삼성전자", "stock"),
                ("373220", "LG에너지솔루션", "stock"),
                ("487240", "KODEX ETF", "etf"),
            ]),
        )
    )

    result = catalog.sync_catalog(market="KOSPI", limit=100)
    assert result == {"KOSPI": 3}

    with get_connection() as conn:
        cat = {r["ticker"]: dict(r) for r in
               conn.execute("SELECT ticker, name, type, market FROM stock_catalog")}
        watch = [r["ticker"] for r in conn.execute("SELECT ticker FROM stocks")]
    # 카탈로그(발굴 유니버스)에 적재
    assert set(cat) == {"005930", "373220", "487240"}
    assert cat["487240"]["type"] == "ETF"
    assert cat["005930"]["market"] == "KOSPI"
    # 워치리스트는 그대로(카탈로그 수집이 관심종목을 오염시키지 않음)
    assert watch == ["005930"]


@respx.mock
def test_sync_catalog_both_markets_when_market_omitted():
    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page([("005930", "삼성전자", "stock")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    result = catalog.sync_catalog(limit=50)
    assert result == {"KOSPI": 1, "KOSDAQ": 1}


def test_sync_catalog_endpoint_rejects_bad_market():
    r = client.post("/api/data/sync-catalog", params={"market": "NASDAQ"})
    assert r.status_code == 400


@respx.mock
def test_sync_catalog_detailed_returns_frontend_counts():
    # 설정 화면 '종목 목록 수집' 계약: kospi/kosdaq/etf/total/saved 카운트
    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page([
            ("005930", "삼성전자", "stock"), ("069500", "KODEX 200", "etf")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    r = client.post("/api/settings/ticker-catalog/collect", params={"limit": 50}).json()
    assert r["kospi_count"] == 2
    assert r["kosdaq_count"] == 1
    assert r["etf_count"] == 1
    assert r["total_collected"] == 3
    assert r["saved_count"] == 3


@respx.mock
def test_sync_catalog_endpoint_returns_counts():
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    r = client.post("/api/data/sync-catalog", params={"market": "KOSDAQ", "limit": 10})
    assert r.status_code == 200
    assert r.json() == {"synced": {"KOSDAQ": 1}}


def test_clear_catalog_endpoint():
    from app.database import get_connection
    with get_connection() as conn:
        conn.execute("INSERT INTO stock_catalog (ticker, name, type, market) VALUES ('005930','삼성전자','STOCK','KOSPI')")
    r = client.delete("/api/settings/ticker-catalog").json()
    assert r["deleted"] == 1
    with get_connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM stock_catalog").fetchone()[0] == 0


def test_catalog_progress_shape():
    body = client.get("/api/settings/ticker-catalog/collect-progress").json()
    for f in ("status", "step_index", "total_steps", "items_collected", "message"):
        assert f in body
