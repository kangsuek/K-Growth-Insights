"""작업 4(AI 인사이트) 테스트: 수급 비율 스케일링·지속성·요약·엔드포인트."""
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import insights
from tests.conftest import seed_stock

client = TestClient(app)


def _seed_prices(ticker, closes, volume=1_000_000):
    """closes(오래된→최신)로 prices를 채운다. 날짜는 순번으로 부여."""
    with get_connection() as conn:
        for i, c in enumerate(closes):
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 0)""",
                (ticker, f"2026-07-{i + 1:02d}", c, c, c, c, volume),
            )


def _seed_flow(ticker, foreign_nets):
    """foreign_nets(오래된→최신)로 trading_flow를 채운다."""
    with get_connection() as conn:
        for i, fn in enumerate(foreign_nets):
            conn.execute(
                """INSERT INTO trading_flow (ticker, date, individual_net,
                   institutional_net, foreign_net, foreign_hold_ratio)
                   VALUES (?, ?, 0, 0, ?, 50)""",
                (ticker, f"2026-07-{i + 1:02d}", fn),
            )


# --- 수급 비율 스케일링 -------------------------------------------------------

def test_flow_signal_none_without_volume():
    assert insights._flow_signal("k", "외국인", [100, 200], None) is None
    assert insights._flow_signal("k", "외국인", [None, None], 1000) is None


def test_flow_signal_neutral_below_threshold():
    # 누적/일평균거래량 = 4% < 5% → 중립
    sig = insights._flow_signal("foreign_flow", "외국인", [10_000, 10_000, 20_000], 1_000_000)
    assert sig["level"] == "neutral"
    assert "방향성이 없습니다" in sig["text"]


def test_flow_signal_large_and_persistent():
    # 5일 모두 순매수, 누적 1,000,000 / 일평균 1,000,000 = 100% → 대규모 + 지속
    sig = insights._flow_signal(
        "foreign_flow", "외국인", [200_000] * 5, 1_000_000
    )
    assert sig["level"] == "positive"
    assert "대규모" in sig["text"]
    assert "지속" in sig["text"]


def test_flow_signal_net_sell_direction():
    sig = insights._flow_signal("foreign_flow", "외국인", [-200_000] * 5, 1_000_000)
    assert sig["level"] == "negative"
    assert "순매도" in sig["text"]


def test_flow_signal_not_persistent_when_mixed_direction():
    # 합계는 양(+)이지만 같은 방향 거래일이 3일뿐 → '지속' 미표기
    sig = insights._flow_signal(
        "foreign_flow", "외국인", [300_000, 300_000, 300_000, -100_000, -100_000], 1_000_000
    )
    assert sig["level"] == "positive"
    assert "지속" not in sig["text"]


# --- 추세/요약 통합 -----------------------------------------------------------

def test_build_insights_bullish_regime():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_prices("005930", [100, 102, 104, 106, 108, 110])  # 상승
    _seed_flow("005930", [200_000] * 5)  # 외국인 대규모 순매수
    data = insights.build_insights("005930")
    assert data["type"] == "STOCK"
    keys = {s["key"] for s in data["signals"]}
    assert "foreign_flow" in keys and "price_trend" in keys
    assert "강세 국면" in data["summary"]
    assert data["disclaimer"]


def test_build_insights_unknown_ticker_returns_none():
    assert insights.build_insights("999999") is None


def test_build_insights_data_scarce():
    seed_stock("111111", "신규종목", "STOCK")  # 시세·수급 없음
    data = insights.build_insights("111111")
    assert data["signals"] == []
    assert "데이터가 부족" in data["summary"]


# --- 엔드포인트 ---------------------------------------------------------------

def test_insights_endpoint_404_for_unknown():
    assert client.get("/api/stocks/999999/insights").status_code == 404


def test_insights_endpoint_shape():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_prices("005930", [100, 102, 104, 106, 108, 110])
    _seed_flow("005930", [200_000] * 5)
    r = client.get("/api/stocks/005930/insights")
    assert r.status_code == 200
    body = r.json()
    assert body["ticker"] == "005930"
    assert len(body["signals"]) >= 2
    assert all({"key", "label", "level", "text"} <= set(s) for s in body["signals"])
