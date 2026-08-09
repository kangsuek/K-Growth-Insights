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
    # 최신순: 상승 추세, 변동성 데이터 충분(25거래일)
    prices_desc = [{"date": f"2026-07-{30 - i:02d}", "close_price": 100 - i, "change_pct": 1.0,
                    "volume": 1000} for i in range(25)]
    # 월간·연초대비 기준일(전월 같은 날, 전년 마지막 거래일)까지 시세를 잇는다.
    prices_desc += [
        {"date": "2026-06-30", "close_price": 70, "change_pct": 1.0, "volume": 1000},
        {"date": "2025-12-30", "close_price": 50, "change_pct": 1.0, "volume": 1000},
    ]
    returns, vol = insights._compute_metrics(prices_desc)
    # 1주: 최신(07-30, 100) / 7일 전(07-23, 93) — 네이버 W1과 같은 기준
    assert round(returns["1w"], 2) == round((100 - 93) / 93 * 100, 2)
    # 1달: 전월 같은 날(06-30, 70)
    assert round(returns["1m"], 2) == round((100 - 70) / 70 * 100, 2)
    # 연초대비: 전년 마지막 거래일(2025-12-30, 50)
    assert round(returns["ytd"], 2) == round((100 - 50) / 50 * 100, 2)
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


def _rows(pairs):
    """(날짜, 종가) 목록 → 최신순 시세 행."""
    return [{"date": d, "close_price": c} for d, c in pairs]


def test_return_base_dates_match_naver():
    """수익률 기준일이 네이버증권과 같은지 고정한다.

    거래일 수(5·20거래일)로 잡으면 휴장·급등락일이 낀 주에 네이버 표기와 크게 어긋난다.
    네이버 기준은 달력 날짜다 — 주간 7일 전, 월간 전월 같은 날, YTD 전년 마지막 거래일.
    """
    from app.services import metrics

    rows = _rows([
        ("2026-03-10", 110),
        ("2026-03-09", 108),
        ("2026-03-03", 100),   # 7일 전(03-03) — 주간 기준일
        ("2026-02-10", 90),    # 전월 같은 날 — 월간 기준일
        ("2026-01-02", 80),
        ("2025-12-30", 50),    # 전년 마지막 거래일 — YTD 기준일
        ("2025-12-29", 45),
    ])
    assert round(metrics.weekly_return(rows), 4) == round((110 / 100 - 1) * 100, 4)
    assert round(metrics.monthly_return(rows), 4) == round((110 / 90 - 1) * 100, 4)
    assert round(metrics.ytd_return(rows), 4) == round((110 / 50 - 1) * 100, 4)
    assert metrics.ytd_base(rows) == ("2025-12-30", 50)


def test_return_base_falls_back_to_previous_trading_day():
    """기준 날짜가 휴장이면 그 이전 거래일 종가를 기준가로 쓴다."""
    from app.services import metrics

    # 03-03이 없으므로 그 이전 거래일 03-02가 주간 기준일이 된다.
    rows = _rows([("2026-03-10", 110), ("2026-03-05", 105), ("2026-03-02", 100)])
    assert round(metrics.weekly_return(rows), 4) == round((110 / 100 - 1) * 100, 4)


def test_return_is_none_when_history_too_short():
    """기준일까지 시세가 없으면 값을 만들지 않는다."""
    from app.services import metrics

    rows = _rows([("2026-03-10", 110), ("2026-03-09", 108)])
    assert metrics.weekly_return(rows) is None
    assert metrics.monthly_return(rows) is None
    assert metrics.ytd_return(rows) is None
    assert metrics.weekly_return([]) is None
    # 기준일 종가가 비어 있으면 그 행은 기준가로 쓰지 않는다.
    assert metrics.weekly_return(_rows([("2026-03-10", 110), ("2026-03-03", None)])) is None


def test_prev_month_day_clamps_to_month_end():
    """전월에 없는 날짜(3/31 → 2/28)는 말일로 맞춘다."""
    from datetime import date

    from app.services import metrics

    assert metrics.prev_month_day(date(2026, 3, 31)) == date(2026, 2, 28)
    assert metrics.prev_month_day(date(2026, 1, 15)) == date(2025, 12, 15)
