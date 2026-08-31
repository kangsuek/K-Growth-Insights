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


# --- 기술적 지표(MACD/RSI) -----------------------------------------------------

def test_calculate_ema_matches_hand_computed_values():
    """EMA(3) — 첫 값은 SMA, 이후 표준 지수이동평균 공식."""
    ema = metrics.calculate_ema([1.0, 2.0, 3.0, 4.0, 5.0], period=3)
    assert ema[:2] == [None, None]
    assert round(ema[2], 6) == 2.0    # SMA(1,2,3)
    assert round(ema[3], 6) == 3.0    # (4-2)*0.5+2
    assert round(ema[4], 6) == 4.0    # (5-3)*0.5+3


def test_calculate_ema_insufficient_data_returns_all_none():
    assert metrics.calculate_ema([1.0, 2.0], period=3) == [None, None]


def test_calculate_rsi_all_gains_approaches_hundred():
    """연속 상승만 있으면(손실 0) RSI = 100 - 100/101 ≈ 99.01(구현이 손실 0을 RS=100으로 처리)."""
    closes = [float(i) for i in range(1, 17)]  # 16개, period=14
    rsi = metrics.calculate_rsi(closes, period=14)
    assert rsi[:14] == [None] * 14
    expected = 100 - 100 / 101
    assert round(rsi[14], 6) == round(expected, 6)
    assert round(rsi[15], 6) == round(expected, 6)


def test_calculate_rsi_insufficient_data_returns_all_none():
    assert metrics.calculate_rsi([1.0, 2.0], period=14) == [None, None]


def test_calculate_macd_insufficient_data_returns_all_none():
    macd_line, signal_line = metrics.calculate_macd([1.0] * 10)  # slow(26)+signal(9) 미만
    assert macd_line == [None] * 10
    assert signal_line == [None] * 10


def test_macd_cross_signal_none_when_insufficient_data():
    assert metrics.macd_cross_signal([1.0] * 10) is None


def test_rsi_zone_entered_none_when_insufficient_data():
    assert metrics.rsi_zone_entered([1.0, 2.0]) is None


def test_rsi_zone_entered_already_overbought_is_not_a_new_entry():
    """계속 과매수 상태였다면(전일도 70 이상) '새로 진입'이 아니라 None."""
    closes = [float(i) for i in range(1, 17)]  # 연속 상승 → RSI가 처음부터 70 이상
    assert metrics.rsi_zone_entered(closes, period=14) is None


def test_rsi_zone_entered_detects_new_overbought_entry():
    """완만한 등락 뒤 마지막 날 급등 — RSI가 70을 새로 돌파하면 'overbought'."""
    closes = [100.0]
    for i in range(20):
        closes.append(closes[-1] + (1 if i % 2 == 0 else -1))
    closes.append(closes[-1] * 1.5)  # 마지막 날 급등

    rsi = metrics.calculate_rsi(closes, period=14)
    valid = [v for v in rsi if v is not None]
    assert valid[-2] < metrics.RSI_OVERBOUGHT
    assert valid[-1] >= metrics.RSI_OVERBOUGHT
    assert metrics.rsi_zone_entered(closes, period=14) == "overbought"


def test_rsi_zone_entered_detects_new_oversold_entry():
    """완만한 등락 뒤 마지막 날 급락 — RSI가 30을 새로 하향 돌파하면 'oversold'."""
    closes = [100.0]
    for i in range(20):
        closes.append(closes[-1] + (1 if i % 2 == 0 else -1))
    closes.append(closes[-1] * 0.5)  # 마지막 날 급락

    rsi = metrics.calculate_rsi(closes, period=14)
    valid = [v for v in rsi if v is not None]
    assert valid[-2] > metrics.RSI_OVERSOLD
    assert valid[-1] <= metrics.RSI_OVERSOLD
    assert metrics.rsi_zone_entered(closes, period=14) == "oversold"


def _first_cross_index(macd_line, signal_line, idx, *, upward: bool) -> int | None:
    """idx(유효 구간) 중 MACD-시그널 부호가 처음 바뀌는 인덱스. 없으면 None."""
    for a, b in zip(idx, idx[1:]):
        below_to_above = macd_line[a] <= signal_line[a] and macd_line[b] > signal_line[b]
        above_to_below = macd_line[a] >= signal_line[a] and macd_line[b] < signal_line[b]
        if upward and below_to_above:
            return b
        if not upward and above_to_below:
            return b
    return None


def test_macd_cross_signal_detects_golden_cross():
    """장기 하락 후 급격한 상승 반전 — 교차가 일어난 그날까지만 잘라내면 'golden'."""
    closes = [100.0 - i * 0.5 for i in range(40)]            # 40일 완만한 하락
    closes += [closes[-1] + i * 5.0 for i in range(1, 26)]   # 이후 25일 급반등

    macd_line, signal_line = metrics.calculate_macd(closes)
    idx = [i for i in range(len(macd_line))
           if macd_line[i] is not None and signal_line[i] is not None]
    cross_i = _first_cross_index(macd_line, signal_line, idx, upward=True)
    assert cross_i is not None, "테스트 데이터에서 골든크로스가 발생해야 한다"
    assert metrics.macd_cross_signal(closes[: cross_i + 1]) == "golden"


def test_macd_cross_signal_detects_dead_cross():
    """장기 상승 후 급격한 하락 반전 — 교차가 일어난 그날까지만 잘라내면 'dead'."""
    closes = [100.0 + i * 0.5 for i in range(40)]            # 40일 완만한 상승
    closes += [closes[-1] - i * 5.0 for i in range(1, 26)]   # 이후 25일 급락

    macd_line, signal_line = metrics.calculate_macd(closes)
    idx = [i for i in range(len(macd_line))
           if macd_line[i] is not None and signal_line[i] is not None]
    cross_i = _first_cross_index(macd_line, signal_line, idx, upward=False)
    assert cross_i is not None, "테스트 데이터에서 데드크로스가 발생해야 한다"
    assert metrics.macd_cross_signal(closes[: cross_i + 1]) == "dead"
