"""Pydantic response models."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class Stock(BaseModel):
    ticker: str
    name: str
    type: str = "STOCK"
    theme: Optional[str] = None


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
    ok: bool = True
    error: Optional[str] = None


class CollectAllResult(BaseModel):
    total: int
    succeeded: int
    failed: int
    results: list[CollectResult]
