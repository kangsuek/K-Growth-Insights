"""화면 공통 수익률·변동성 계산.

주간 수익률은 대시보드(batch-summary)·종목 발굴(scanner)·인사이트(insights)에서 각각
계산하다 기준일이 어긋난 적이 있다(대시보드만 6거래일 전을 썼다). 같은 이름의 지표가
화면마다 다른 값을 내지 않도록 계산식을 여기 한 곳에 둔다.

기준일은 **네이버증권 표기와 동일**하게 잡는다. 거래일 수(5거래일·20거래일)가 아니라
달력 날짜가 기준이다 — 네이버 ETF분석의 W1/M1/YTD를 역산해 확인한 정의다.

- 주간(W1)   : 기준일의 7일 전
- 월간(M1)   : 기준일의 전월 같은 날
- 연초대비(YTD): **전년도 마지막 거래일** (올해 첫 거래일이 아니다)

기준 날짜가 휴장일이면 그 이전의 가장 최근 거래일 종가를 기준가로 쓴다. 시세가 기준일까지
닿지 않으면 값을 만들어내지 않고 None을 돌려준다.

연환산 변동성도 비교(comparison)·인사이트(insights)에서 각각 구현돼 있었다.
"""
from __future__ import annotations

import calendar
import math
from datetime import date, timedelta

# 연환산에 쓰는 연간 거래일 수.
TRADING_DAYS_PER_YEAR = 252


def _as_date(value) -> date | None:
    """'YYYY-MM-DD'(또는 date) → date. 파싱 불가면 None."""
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _current(rows_desc: list[dict]) -> tuple[date | None, float | None]:
    """최신순 시세의 첫 행 → (기준일, 종가). 비었거나 값이 없으면 (None, None)."""
    if not rows_desc:
        return None, None
    row = rows_desc[0]
    return _as_date(row.get("date")), row.get("close_price")


def base_on_or_before(rows_desc: list[dict], target: date | None) -> tuple[str | None, float | None]:
    """target(포함) 이하 가장 최근 거래일의 (날짜 ISO, 종가). 없으면 (None, None).

    rows_desc가 최신순이므로 앞에서부터 처음 만나는 target 이하 행이 곧 기준일이다.
    """
    if target is None:
        return None, None
    limit = target.isoformat()
    for row in rows_desc:
        day = row.get("date")
        if day and str(day)[:10] <= limit and row.get("close_price"):
            return str(day)[:10], row["close_price"]
    return None, None


def _pct(current, base) -> float | None:
    if not current or not base:
        return None
    return (current - base) / base * 100


def prev_month_day(day: date) -> date:
    """전월 같은 날. 그 달에 없는 날짜(예: 3/31 → 2/28)면 말일로 맞춘다."""
    year, month = (day.year - 1, 12) if day.month == 1 else (day.year, day.month - 1)
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def weekly_return(rows_desc: list[dict]) -> float | None:
    """주간 수익률(%) — 기준일의 7일 전 종가 대비(네이버 W1)."""
    cur_date, cur = _current(rows_desc)
    if cur_date is None:
        return None
    _, base = base_on_or_before(rows_desc, cur_date - timedelta(days=7))
    return _pct(cur, base)


def monthly_return(rows_desc: list[dict]) -> float | None:
    """월간 수익률(%) — 기준일의 전월 같은 날 종가 대비(네이버 M1)."""
    cur_date, cur = _current(rows_desc)
    if cur_date is None:
        return None
    _, base = base_on_or_before(rows_desc, prev_month_day(cur_date))
    return _pct(cur, base)


def ytd_base(rows_desc: list[dict]) -> tuple[str | None, float | None]:
    """연초대비 기준 (날짜 ISO, 종가) — 전년도 마지막 거래일(네이버 YTD).

    연중 상장 종목은 전년도 시세가 없어 (None, None)이 된다. 이때는 상장 후 첫
    거래일을 기준으로 삼는 쪽이 화면에 값이 뜨므로 호출부에서 보완한다.
    """
    cur_date, _ = _current(rows_desc)
    if cur_date is None:
        return None, None
    return base_on_or_before(rows_desc, date(cur_date.year - 1, 12, 31))


def ytd_return(rows_desc: list[dict]) -> float | None:
    """연초대비 수익률(%) — 전년도 마지막 거래일 종가 대비(네이버 YTD)."""
    _, cur = _current(rows_desc)
    _, base = ytd_base(rows_desc)
    return _pct(cur, base)


def sample_stdev(xs: list[float]) -> float | None:
    """표본표준편차(n-1로 나눈다). 표본이 2개 미만이면 None.

    수익률 변동성은 모집단 전체가 아니라 관측된 표본이므로 n-1(베셀 보정)을 쓴다.
    금융 실무의 표준 관례이며, 표본이 짧을 때 모표준편차(n)는 변동성을 과소평가한다.
    """
    n = len(xs)
    if n < 2:
        return None
    mean = sum(xs) / n
    return math.sqrt(sum((x - mean) ** 2 for x in xs) / (n - 1))


def annualized_volatility(daily_returns_pct: list[float]) -> float | None:
    """일간 수익률(%) 목록 → 연환산 변동성(%). 데이터가 부족하면 None.

    입력은 퍼센트 단위(예: 1.5 = +1.5%)로 받는다. 반환도 퍼센트다.
    """
    sd = sample_stdev(daily_returns_pct)
    if sd is None:
        return None
    return sd * math.sqrt(TRADING_DAYS_PER_YEAR)


# --- 기술적 지표(MACD/RSI) ----------------------------------------------------
#
# 종목 발굴의 '추세 전환 확인 필요' 필터가 쓴다. 계산식은 종목 상세 화면
# (frontend/src/utils/technicalIndicators.js)과 동일하게 맞춰, 발굴에서 골든크로스로
# 뜬 종목이 상세 페이지에서도 같은 판정으로 보이도록 한다.

RSI_OVERBOUGHT = 70.0
RSI_OVERSOLD = 30.0


def calculate_ema(values: list[float], period: int) -> list[float | None]:
    """지수이동평균(EMA). 반환은 입력과 같은 길이, 앞의 (period-1)개는 None.

    첫 EMA는 SMA로 시작한다(technicalIndicators.js의 calculateEMA와 동일 방식).
    """
    ema: list[float | None] = [None] * len(values)
    if len(values) < period:
        return ema
    ema[period - 1] = sum(values[:period]) / period
    multiplier = 2 / (period + 1)
    for i in range(period, len(values)):
        ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1]
    return ema


def calculate_rsi(closes_asc: list[float], period: int = 14) -> list[float | None]:
    """RSI(Wilder's smoothing). 반환은 closes_asc와 같은 길이, 앞부분은 None."""
    n = len(closes_asc)
    result: list[float | None] = [None] * n
    if n < period + 1:
        return result

    gains = [max(closes_asc[i] - closes_asc[i - 1], 0.0) for i in range(1, n)]
    losses = [max(closes_asc[i - 1] - closes_asc[i], 0.0) for i in range(1, n)]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    rs = 100.0 if avg_loss == 0 else avg_gain / avg_loss
    result[period] = 100 - 100 / (1 + rs)

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        rs = 100.0 if avg_loss == 0 else avg_gain / avg_loss
        result[i + 1] = 100 - 100 / (1 + rs)
    return result


def calculate_macd(
    closes_asc: list[float], fast: int = 12, slow: int = 26, signal_period: int = 9
) -> tuple[list[float | None], list[float | None]]:
    """(MACD선, 시그널선) — 둘 다 closes_asc와 같은 길이, 계산 불가 구간은 None."""
    n = len(closes_asc)
    if n < slow + signal_period:
        return [None] * n, [None] * n

    fast_ema = calculate_ema(closes_asc, fast)
    slow_ema = calculate_ema(closes_asc, slow)
    macd_line: list[float | None] = [
        (f - s) if f is not None and s is not None else None
        for f, s in zip(fast_ema, slow_ema)
    ]

    valid = [v for v in macd_line if v is not None]
    signal_ema = calculate_ema(valid, signal_period)

    signal_line: list[float | None] = [None] * n
    vi = 0
    for i, v in enumerate(macd_line):
        if v is not None:
            signal_line[i] = signal_ema[vi]
            vi += 1
    return macd_line, signal_line


def macd_cross_signal(closes_asc: list[float]) -> str | None:
    """가장 최근 거래일에 MACD가 시그널선을 돌파했으면 'golden'/'dead', 아니면 None.

    어제 대비 오늘만 본다 — 며칠째 같은 상태인 종목을 계속 띄우지 않기 위함이다.
    """
    macd_line, signal_line = calculate_macd(closes_asc)
    idx = [i for i in range(len(macd_line))
           if macd_line[i] is not None and signal_line[i] is not None]
    if len(idx) < 2:
        return None
    prev_macd, prev_sig = macd_line[idx[-2]], signal_line[idx[-2]]
    last_macd, last_sig = macd_line[idx[-1]], signal_line[idx[-1]]
    if prev_macd <= prev_sig and last_macd > last_sig:
        return "golden"
    if prev_macd >= prev_sig and last_macd < last_sig:
        return "dead"
    return None


def rsi_zone_entered(closes_asc: list[float], period: int = 14) -> str | None:
    """가장 최근 거래일에 RSI가 과매수/과매도 구간에 새로 진입했으면
    'overbought'/'oversold', 아니면 None(계속 그 구간에 머물러 있던 경우도 None)."""
    rsi = calculate_rsi(closes_asc, period)
    idx = [i for i in range(len(rsi)) if rsi[i] is not None]
    if len(idx) < 2:
        return None
    prev, last = rsi[idx[-2]], rsi[idx[-1]]
    if last >= RSI_OVERBOUGHT and prev < RSI_OVERBOUGHT:
        return "overbought"
    if last <= RSI_OVERSOLD and prev > RSI_OVERSOLD:
        return "oversold"
    return None


# --- 추세 지속성 -------------------------------------------------------------
#
# '연초 이후 꾸준히 올랐는가'는 연초대비 수익률(ytd_return)만으로 판정할 수 없다.
# 폭락 후 반등도 +로 잡히기 때문이다(KODEX 건설: 7/07→7/31 -12.8%, 이후 +16.6% → YTD +58%).
# 아래 네 지표를 함께 봐야 '직선처럼 올랐는지'와 '도중에 무너진 적 있는지'가 갈린다.

# 20일 이동평균 — 추세 이탈 판정 창.
TREND_MA_WINDOW = 20

# 지표를 계산할 최소 거래일. 너무 짧으면 R²가 우연히 높게 나온다.
TREND_MIN_DAYS = 60


def _linear_r2_and_slope(values: list[float]) -> tuple[float | None, float | None]:
    """로그값을 시간(0,1,2...)에 회귀한 (R², 기울기). 계산 불가면 (None, None).

    로그를 쓰는 이유는 수익률이 복리로 쌓이기 때문이다. 원값으로 회귀하면 가격대가
    높은 구간의 잔차가 커져 후반부에 과도하게 끌려간다.
    """
    n = len(values)
    if n < 2 or any(v is None or v <= 0 for v in values):
        return None, None
    ys = [math.log(v) for v in values]
    xs = list(range(n))
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    if sxx == 0 or syy == 0:
        return None, None
    return (sxy ** 2) / (sxx * syy) * 100, sxy / sxx


def max_drawdown(closes_asc: list[float]) -> float | None:
    """기간 최대 낙폭(%). 고점 대비 가장 크게 밀린 폭이며 0 이하 값이다."""
    closes = [c for c in closes_asc if c]
    if len(closes) < 2:
        return None
    peak, mdd = closes[0], 0.0
    for c in closes:
        peak = max(peak, c)
        if peak:
            mdd = min(mdd, (c - peak) / peak * 100)
    return mdd


def monthly_win_rate(rows_asc: list[dict], base_price: float | None) -> float | None:
    """월별 수익률 중 양수 비율(%). 월말 종가를 이어 비교한다.

    base_price는 첫 달의 비교 기준(전년도 마지막 거래일 종가). 없으면 첫 달을 건너뛴다.
    """
    last_of_month: dict[str, float] = {}
    for row in rows_asc:
        day, close = str(row.get("date") or "")[:10], row.get("close_price")
        if len(day) >= 7 and close:
            last_of_month[day[:7]] = close      # 오름차순이라 마지막 값이 월말 종가
    if not last_of_month:
        return None
    closes = [last_of_month[m] for m in sorted(last_of_month)]
    prev = base_price or closes[0]
    if not base_price:
        closes = closes[1:]
    if not closes:
        return None
    wins = 0
    for close in closes:
        wins += close > prev
        prev = close
    return wins / len(closes) * 100


def above_ma_ratio(closes_asc: list[float], window: int = TREND_MA_WINDOW) -> float | None:
    """종가가 window일 이동평균 위에 있던 날의 비율(%)."""
    closes = [c for c in closes_asc if c]
    if len(closes) <= window:
        return None
    hits = 0
    for i in range(window - 1, len(closes)):
        ma = sum(closes[i - window + 1:i + 1]) / window
        hits += closes[i] >= ma
    total = len(closes) - window + 1
    return hits / total * 100


def trend_metrics(rows_desc: list[dict], since: str, base_price: float | None = None) -> dict:
    """since(포함) 이후 구간의 추세 지속성 지표.

    rows_desc는 최신순 시세({date, close_price}). 반환 키는 stock_catalog 컬럼과 같다.
    데이터가 짧으면 각 값은 None이 되고, 필터는 NULL을 걸러내므로 자동으로 제외된다.
    """
    rows_asc = [r for r in reversed(rows_desc)
                if str(r.get("date") or "")[:10] >= since and r.get("close_price")]
    empty = {"trend_r2": None, "trend_mdd": None,
             "trend_win_rate": None, "trend_above_ma": None}
    if len(rows_asc) < TREND_MIN_DAYS:
        return empty

    closes = [r["close_price"] for r in rows_asc]
    r2, slope = _linear_r2_and_slope(closes)
    if slope is None or slope <= 0:
        # 추세선이 우하향이면 R²가 높아도 '상승추세'가 아니다.
        return empty
    return {
        "trend_r2": r2,
        "trend_mdd": max_drawdown(closes),
        "trend_win_rate": monthly_win_rate(rows_asc, base_price),
        "trend_above_ma": above_ma_ratio(closes),
    }
