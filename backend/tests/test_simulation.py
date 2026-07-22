"""Phase 6(시뮬레이션) 테스트: 일시/적립식/포트폴리오."""
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import simulation
from tests.conftest import seed_stock

client = TestClient(app)


def _seed(ticker, closes, start_day=1, month=7):
    with get_connection() as conn:
        for i, c in enumerate(closes):
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES (?, ?, ?, ?, ?, ?, 1000, 0)""",
                (ticker, f"2026-{month:02d}-{start_day + i:02d}", c, c, c, c),
            )


def test_lump_sum_shares_and_return():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed("005930", [100, 110, 120])  # 07-01..07-03
    r = simulation.lump_sum("005930", "2026-07-01", 1000.0)
    assert r["shares"] == 10          # 1000 // 100
    assert r["buy_price"] == 100
    assert r["total_return_pct"] == 20.0  # 100→120
    assert r["max_gain"]["return_pct"] == 20.0
    assert len(r["price_series"]) == 3


def test_lump_sum_endpoint():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed("005930", [100, 105])
    r = client.post("/api/simulation/lump-sum",
                    json={"ticker": "005930", "buy_date": "2026-07-01", "amount": 1000})
    assert r.status_code == 200
    assert r.json()["shares"] == 10


def test_lump_sum_insufficient_amount_400():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed("005930", [5000])
    r = client.post("/api/simulation/lump-sum",
                    json={"ticker": "005930", "buy_date": "2026-07-01", "amount": 1000})
    assert r.status_code == 400


def test_dca_accumulates_monthly():
    seed_stock("005930", "삼성전자", "STOCK")
    # 07-01 100원, 08-01 200원
    _seed("005930", [100], start_day=1, month=7)
    _seed("005930", [200], start_day=1, month=8)
    r = simulation.dca("005930", 1000.0, "2026-07-01", "2026-08-31", buy_day=1)
    assert r["total_shares"] == 15    # 07: 10주, 08: 5주
    assert len(r["monthly_data"]) == 2
    assert r["total_invested"] == 2000.0


def test_portfolio_weights_and_series():
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    _seed("005930", [100, 110])
    _seed("000660", [200, 220])
    r = simulation.portfolio(
        [{"ticker": "005930", "weight": 0.5}, {"ticker": "000660", "weight": 0.5}],
        10000.0, "2026-07-01", "2026-07-31")
    assert len(r["holdings_result"]) == 2
    assert r["daily_series"][0]["date"] == "2026-07-01"
    # 둘 다 +10% → 포트폴리오도 약 +10%
    assert r["total_return_pct"] > 0
