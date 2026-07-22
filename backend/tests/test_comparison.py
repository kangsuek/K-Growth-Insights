"""Phase 5(비교) 테스트: 정규화 가격·통계·상관관계."""
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import comparison
from tests.conftest import seed_stock

client = TestClient(app)


def _seed_prices(ticker, closes, start_day=1):
    with get_connection() as conn:
        for i, c in enumerate(closes):
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES (?, ?, ?, ?, ?, ?, 1000, 0)""",
                (ticker, f"2026-07-{start_day + i:02d}", c, c, c, c),
            )


def test_compare_normalizes_and_stats():
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    _seed_prices("005930", [100, 110, 120])
    _seed_prices("000660", [200, 210, 220])
    body = comparison.compare(["005930", "000660"], "2026-07-01", "2026-07-31")
    # 정규화: 시작 100
    assert body["normalized_prices"]["data"]["005930"][0] == 100.0
    assert body["normalized_prices"]["data"]["005930"][-1] == 120.0  # 100→120
    # 통계 period_return
    assert body["statistics"]["005930"]["period_return"] == 20.0
    # 상관관계 대각선 1.0
    idx = body["correlation_matrix"]["tickers"].index("005930")
    assert body["correlation_matrix"]["matrix"][idx][idx] == 1.0


def test_compare_endpoint_requires_two():
    seed_stock("005930", "삼성전자", "STOCK")
    r = client.get("/api/etfs/compare", params={"tickers": "005930"})
    assert r.status_code == 400


def test_compare_endpoint_shape():
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    _seed_prices("005930", [100, 101, 102])
    _seed_prices("000660", [200, 202, 204])
    body = client.get("/api/etfs/compare", params={"tickers": "005930,000660"}).json()
    assert "normalized_prices" in body and "statistics" in body
    assert "correlation_matrix" in body
    assert set(body["statistics"]) == {"005930", "000660"}
