"""인사이트 테스트: 원본 insights_service 로직 재현(strategy/key_points/risks)."""
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import insights
from tests.conftest import seed_stock

client = TestClient(app)


def _seed_prices(ticker, closes, volume=1_000_000, change_pct=0.0):
    """closes(오래된→최신)로 prices를 채운다."""
    with get_connection() as conn:
        for i, c in enumerate(closes):
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (ticker, f"2026-{(i // 28) + 1:02d}-{(i % 28) + 1:02d}", c, c, c, c, volume, change_pct),
            )


def _seed_flow(ticker, foreign_nets):
    with get_connection() as conn:
        for i, fn in enumerate(foreign_nets):
            conn.execute(
                """INSERT INTO trading_flow (ticker, date, individual_net,
                   institutional_net, foreign_net, foreign_hold_ratio)
                   VALUES (?, ?, 0, 0, ?, 50)""",
                (ticker, f"2026-07-{i + 1:02d}", fn),
            )


# --- 전략 판정 ---------------------------------------------------------------

def test_strategy_from_return_thresholds():
    assert insights._strategy_from_return(None) == "관망"
    assert insights._strategy_from_return(12) == "비중확대"   # >10
    assert insights._strategy_from_return(7) == "보유"        # >5
    assert insights._strategy_from_return(0) == "관망"        # >-5
    assert insights._strategy_from_return(-8) == "비중축소"   # <=-5


def test_foreign_net_threshold_scales_with_volume():
    prices = [{"volume": 1_000_000}] * 20
    # 0.05 × 1,000,000 × 5일 = 250,000
    assert insights._foreign_net_threshold(prices, 5) == 250_000
    # 거래량 없으면 폴백
    assert insights._foreign_net_threshold([], 5) == insights.FOREIGN_NET_SUSTAINED_FALLBACK_THRESHOLD


# --- 지표 계산 ---------------------------------------------------------------

def test_compute_metrics_returns_and_volatility():
    # 최신순: 상승 추세, 변동성 데이터 충분
    prices_desc = [{"date": f"2026-07-{30 - i:02d}", "close_price": 100 - i, "change_pct": 1.0,
                    "volume": 1000} for i in range(25)]
    returns, vol = insights._compute_metrics(prices_desc)
    # 1주(5거래일): 최신 100 / index4(96) → (100-96)/96*100
    assert round(returns["1w"], 2) == round((100 - 96) / 96 * 100, 2)
    assert returns["1m"] is not None  # 20거래일 이상
    assert vol is not None            # 10개 이상 변화율


# --- 통합 + 엔드포인트 --------------------------------------------------------

def test_build_insights_shape_and_bullish():
    seed_stock("005930", "삼성전자", "STOCK")
    # 최근일 종가 대비 1주/1달 전보다 크게 상승 → 비중확대 성향
    closes = list(range(80, 130))  # 오래된→최신 상승(50일)
    _seed_prices("005930", closes, change_pct=1.5)
    _seed_flow("005930", [500_000] * 5)  # 외국인 대규모 순매수
    data = insights.build_insights("005930")
    assert set(data) == {"strategy", "key_points", "risks"}
    s = data["strategy"]
    assert set(s) == {"short_term", "medium_term", "long_term", "recommendation", "comment"}
    valid = {"비중확대", "보유", "관망", "비중축소"}
    assert s["short_term"] in valid and s["recommendation"] in valid
    assert any("외국인 대규모 순매수" in p for p in data["key_points"])


def test_build_insights_unknown_ticker_none():
    assert insights.build_insights("999999") is None


def test_insights_endpoint_shape():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_prices("005930", list(range(80, 130)), change_pct=1.0)
    r = client.get("/api/etfs/005930/insights?period=1m")
    assert r.status_code == 200
    body = r.json()
    assert "strategy" in body and "key_points" in body and "risks" in body


def test_insights_endpoint_404():
    assert client.get("/api/etfs/999999/insights").status_code == 404
