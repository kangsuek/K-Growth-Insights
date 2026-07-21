"""Read endpoints for the tracked stocks/ETFs and their market data."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import IntradayPoint, PricePoint, Stock, TradingFlowPoint
from app.services import repository

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


@router.get("", response_model=list[Stock])
def list_stocks():
    return repository.list_stocks()


@router.get("/{ticker}", response_model=Stock)
def get_stock(ticker: str):
    stock = repository.get_stock(ticker)
    if not stock:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
    return stock


@router.get("/{ticker}/prices", response_model=list[PricePoint])
def get_prices(ticker: str, days: int = Query(60, ge=1, le=250)):
    _ensure_stock(ticker)
    return repository.get_prices(ticker, days=days)


@router.get("/{ticker}/trading-flow", response_model=list[TradingFlowPoint])
def get_trading_flow(ticker: str, days: int = Query(20, ge=1, le=120)):
    _ensure_stock(ticker)
    return repository.get_trading_flow(ticker, days=days)


@router.get("/{ticker}/intraday", response_model=list[IntradayPoint])
def get_intraday(ticker: str):
    _ensure_stock(ticker)
    return repository.get_intraday(ticker)


def _ensure_stock(ticker: str) -> None:
    if not repository.get_stock(ticker):
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
