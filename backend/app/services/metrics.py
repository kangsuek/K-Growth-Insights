"""화면 공통 수익률 계산.

주간 수익률은 대시보드(batch-summary)·종목 발굴(scanner)·인사이트(insights)에서 각각
계산하다 기준일이 어긋난 적이 있다(대시보드만 6거래일 전을 썼다). 같은 이름의 지표가
화면마다 다른 값을 내지 않도록 계산식을 여기 한 곳에 둔다.
"""
from __future__ import annotations

# 최신 종가 기준 5거래일 전(최신순 배열의 인덱스 4)을 주간 기준일로 삼는다.
WEEKLY_LOOKBACK = 4


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
