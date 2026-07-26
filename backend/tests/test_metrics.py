"""공통 지표(metrics) 테스트: 주간 수익률·표본표준편차·연환산 변동성."""
import math

from app.services import comparison, insights, metrics


def test_sample_stdev_uses_n_minus_1():
    """표본표준편차(n-1)를 쓴다. 모표준편차(n)와 값이 달라야 한다."""
    xs = [10.0, -10.0]
    # 모표준편차: sqrt(200/2)=10, 표본표준편차: sqrt(200/1)=14.142...
    assert round(metrics.sample_stdev(xs), 6) == round(math.sqrt(200.0), 6)
    assert metrics.sample_stdev(xs) > 10.0


def test_sample_stdev_needs_two_points():
    assert metrics.sample_stdev([]) is None
    assert metrics.sample_stdev([1.5]) is None


def test_annualized_volatility_scales_by_trading_days():
    """연환산 = 표본표준편차 × sqrt(252)."""
    xs = [10.0, -10.0]
    expected = math.sqrt(200.0) * math.sqrt(metrics.TRADING_DAYS_PER_YEAR)
    assert round(metrics.annualized_volatility(xs), 6) == round(expected, 6)
    assert metrics.annualized_volatility([1.0]) is None


def test_comparison_volatility_is_sample_based():
    """비교 화면의 변동성도 표본표준편차 기준이어야 한다.

    종가 [100, 110, 99]의 일간 수익률은 +10%, -10%.
    표본표준편차 = sqrt(0.02) = 14.1421%(퍼센트 단위) → 연환산 224.50%.
    모표준편차였다면 10% → 158.75%가 나온다.
    """
    stats = comparison._statistics([100.0, 110.0, 99.0])
    expected = math.sqrt(200.0) * math.sqrt(metrics.TRADING_DAYS_PER_YEAR)
    assert stats["volatility"] == round(expected, 2)
    assert stats["volatility"] > 200  # 모표준편차(158.75)와 확실히 구분된다


def test_insights_volatility_uses_same_formula():
    """인사이트 변동성도 같은 식을 쓴다(예전에는 모표준편차로 따로 계산했다)."""
    # change_pct가 +1/-1을 번갈아 12개 → 표본표준편차 기준 연환산
    changes = [1.0 if i % 2 == 0 else -1.0 for i in range(12)]
    prices_desc = [{"date": f"2026-07-{30 - i:02d}", "close_price": 100.0,
                    "change_pct": changes[i], "volume": 1000} for i in range(12)]

    _, vol = insights._compute_metrics(prices_desc)

    assert vol is not None
    assert round(vol, 6) == round(metrics.annualized_volatility(changes), 6)
