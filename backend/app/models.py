"""Pydantic response models."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class Stock(BaseModel):
    ticker: str
    name: str
    type: str = "STOCK"
    theme: Optional[str] = None


class StockSummary(BaseModel):
    ticker: str
    name: str
    type: str = "STOCK"
    theme: Optional[str] = None
    close_price: Optional[float] = None
    change_pct: Optional[float] = None
    date: Optional[str] = None


class PricePoint(BaseModel):
    date: str
    open_price: Optional[float] = None
    high_price: Optional[float] = None
    low_price: Optional[float] = None
    close_price: Optional[float] = None
    volume: Optional[int] = None
    change_pct: Optional[float] = None


class TradingFlowPoint(BaseModel):
    date: str
    individual_net: Optional[int] = None
    institutional_net: Optional[int] = None
    foreign_net: Optional[int] = None
    foreign_hold_ratio: Optional[float] = None


class IntradayPoint(BaseModel):
    datetime: str
    open_price: Optional[float] = None
    high_price: Optional[float] = None
    low_price: Optional[float] = None
    price: Optional[float] = None
    volume: Optional[int] = None


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


class News(BaseModel):
    title: str
    link: str
    description: Optional[str] = None
    pub_date: Optional[str] = None


class InsightSignal(BaseModel):
    key: str          # foreign_flow / institutional_flow / price_trend / range_52w / valuation
    label: str
    level: str        # positive | negative | neutral (프론트 색상용)
    text: str


class InsightsResponse(BaseModel):
    ticker: str
    type: str         # STOCK | ETF
    summary: str
    signals: list[InsightSignal] = []
    generated_at: str
    disclaimer: str


class StockFundamentals(BaseModel):
    per: Optional[float] = None
    pbr: Optional[float] = None
    eps: Optional[float] = None
    bps: Optional[float] = None
    est_per: Optional[float] = None
    est_eps: Optional[float] = None
    dividend_yield: Optional[float] = None
    dividend: Optional[float] = None
    foreign_rate: Optional[float] = None
    high_52w: Optional[float] = None
    low_52w: Optional[float] = None
    market_value: Optional[str] = None
    updated_at: Optional[str] = None


class EtfFundamentals(BaseModel):
    issuer_name: Optional[str] = None
    market_value: Optional[str] = None
    nav: Optional[float] = None
    total_nav: Optional[str] = None
    deviation_rate: Optional[float] = None
    total_fee: Optional[float] = None
    dividend_yield: Optional[float] = None
    return_1m: Optional[float] = None
    return_3m: Optional[float] = None
    return_1y: Optional[float] = None
    updated_at: Optional[str] = None


class EtfHolding(BaseModel):
    seq: int
    item_code: Optional[str] = None
    item_name: Optional[str] = None
    weight: Optional[float] = None


class FundamentalsResponse(BaseModel):
    ticker: str
    type: str  # STOCK | ETF
    stock: Optional[StockFundamentals] = None
    etf: Optional[EtfFundamentals] = None
    holdings: list[EtfHolding] = []
