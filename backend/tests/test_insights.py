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


# --- 추세 지속성 --------------------------------------------------------------

def _daily(start_close, n, step, start="2026-01-02"):
    """등차로 움직이는 일별 시세(최신순). 주말은 무시 — 계산은 날짜 간격을 쓰지 않는다."""
    from datetime import date, timedelta
    d0 = date.fromisoformat(start)
    rows = [{"date": (d0 + timedelta(days=i)).isoformat(), "close_price": start_close + step * i}
            for i in range(n)]
    return list(reversed(rows))


def test_trend_metrics_straight_uptrend_scores_high():
    """곧게 오르면 R²가 높고 낙폭이 없다."""
    from app.services import metrics

    t = metrics.trend_metrics(_daily(10000, 150, 20), since="2026-01-01")
    assert t["trend_r2"] > 95
    assert t["trend_mdd"] == 0.0            # 고점을 계속 갱신하므로 낙폭 없음
    assert t["trend_above_ma"] == 100.0     # 상승 중엔 늘 이동평균 위


def test_trend_metrics_rejects_downtrend():
    """우하향이면 R²가 높아도 상승추세가 아니므로 값을 내지 않는다."""
    from app.services import metrics

    t = metrics.trend_metrics(_daily(20000, 150, -20), since="2026-01-01")
    assert t == {"trend_r2": None, "trend_mdd": None,
                 "trend_win_rate": None, "trend_above_ma": None}


def test_trend_metrics_crash_then_rebound_has_deep_drawdown():
    """폭락 후 반등은 YTD가 +여도 낙폭으로 걸러진다.

    실제 사례: KODEX 건설 YTD +58%인데 7/07~7/31 -12.8% 구간이 있었다.
    """
    from app.services import metrics

    down = _daily(20000, 80, -150)                 # 20,000 → 8,150 까지 하락
    rows = _daily(8000, 70, 250, start="2026-04-23")  # 이후 반등
    combined = rows + down                          # 최신순으로 이어붙인다
    t = metrics.trend_metrics(combined, since="2026-01-01")
    assert t["trend_mdd"] < -50                     # 도중에 반토막
    assert t["trend_r2"] < 60                       # 직선과 거리가 멀다


def test_trend_metrics_needs_enough_history():
    """거래일이 너무 짧으면 R²가 우연히 높게 나오므로 계산하지 않는다."""
    from app.services import metrics

    t = metrics.trend_metrics(_daily(10000, 30, 50), since="2026-01-01")
    assert t["trend_r2"] is None


def test_monthly_win_rate_counts_positive_months():
    from app.services import metrics

    rows = [
        {"date": "2026-01-30", "close_price": 110},   # 100 → 110  +
        {"date": "2026-02-27", "close_price": 105},   # 110 → 105  -
        {"date": "2026-03-31", "close_price": 120},   # 105 → 120  +
        {"date": "2026-04-30", "close_price": 130},   # 120 → 130  +
    ]
    assert metrics.monthly_win_rate(rows, base_price=100) == 75.0


def test_max_drawdown_measures_peak_to_trough():
    from app.services import metrics

    assert metrics.max_drawdown([100, 120, 60, 90]) == -50.0   # 120 → 60
    assert metrics.max_drawdown([100, 110, 120]) == 0.0
    assert metrics.max_drawdown([100]) is None
