"""화면 공통 수익률·변동성 계산.

주간 수익률은 대시보드(batch-summary)·종목 발굴(scanner)·인사이트(insights)에서 각각
계산하다 기준일이 어긋난 적이 있다(대시보드만 6거래일 전을 썼다). 같은 이름의 지표가
화면마다 다른 값을 내지 않도록 계산식을 여기 한 곳에 둔다.

연환산 변동성도 비교(comparison)·인사이트(insights)에서 각각 구현돼 있었다.
"""
from __future__ import annotations

import math

# 최신 종가 기준 5거래일 전(최신순 배열의 인덱스 4)을 주간 기준일로 삼는다.
WEEKLY_LOOKBACK = 4

# 연환산에 쓰는 연간 거래일 수.
TRADING_DAYS_PER_YEAR = 252


def weekly_return(closes_desc: list) -> float | None:
    """최신순 종가 목록으로 주간 수익률(%)을 계산한다. 데이터가 부족하면 None.

    closes_desc[0]이 최신 종가다. 기준일 종가가 없거나 0이면 계산하지 않는다.
    """
    if len(closes_desc) < WEEKLY_LOOKBACK + 1:
        return None
    current = closes_desc[0]
    base = closes_desc[WEEKLY_LOOKBACK]
    if not current or not base:
        return None
    return (current - base) / base * 100


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
