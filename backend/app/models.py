"""Pydantic response models.

현재 라우터는 대부분 dict를 그대로 반환하므로, 실제로 참조되는 모델만 남긴다.
(응답 모델을 새로 만들 때는 그 라우트에서 실제로 쓰이는지 확인할 것.)
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class CollectResult(BaseModel):
    ticker: str
    prices: int = 0
    trading_flow: int = 0
    intraday: int = 0
    fundamentals: int = 0  # 주식/ETF 펀더멘털 스냅샷(0 또는 1)
    holdings: int = 0  # ETF 구성종목 행 수
    news: int = 0  # 수집한 뉴스 건수
    ok: bool = True
    error: Optional[str] = None
