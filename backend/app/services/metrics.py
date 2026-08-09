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
