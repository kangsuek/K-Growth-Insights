"""작업 2(카탈로그 자동 확장) 통합 테스트: 수집 → upsert(수기 theme 보존) → 엔드포인트."""
import httpx
import respx
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import catalog, naver_client
from tests.conftest import seed_stock

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
def test_sync_catalog_inserts_and_preserves_theme():
    # 수기 목록에 이미 theme가 있는 종목
    seed_stock("005930", "삼성전자", "STOCK", theme="반도체")

    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(
            200,
            json=_page(
                [
                    ("005930", "삼성전자", "stock"),  # 기존 → theme 보존
                    ("373220", "LG에너지솔루션", "stock"),  # 신규
                    ("487240", "KODEX ETF", "etf"),  # 신규 ETF
                ]
            ),
        )
    )

    result = catalog.sync_catalog(market="KOSPI", limit=100)
    assert result == {"KOSPI": 3}

    with get_connection() as conn:
        rows = {
            r["ticker"]: dict(r)
            for r in conn.execute("SELECT ticker, name, type, theme FROM stocks")
        }
    # 신규 종목 추가됨
    assert rows["373220"]["type"] == "STOCK"
    assert rows["487240"]["type"] == "ETF"
    # 기존 종목의 수기 theme는 카탈로그 동기화로 덮어써지지 않음
    assert rows["005930"]["theme"] == "반도체"


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
def test_sync_catalog_endpoint_returns_counts():
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    r = client.post("/api/data/sync-catalog", params={"market": "KOSDAQ", "limit": 10})
    assert r.status_code == 200
    assert r.json() == {"synced": {"KOSDAQ": 1}}
