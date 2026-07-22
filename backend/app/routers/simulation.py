"""투자 시뮬레이션 엔드포인트 — 일시/적립식/포트폴리오."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import simulation

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class LumpSumRequest(BaseModel):
    ticker: str
    buy_date: str
    amount: float


class DCARequest(BaseModel):
    ticker: str
    monthly_amount: float
    start_date: str
    end_date: str
    buy_day: int = 1


class PortfolioHolding(BaseModel):
    ticker: str
    weight: float


class PortfolioRequest(BaseModel):
    holdings: list[PortfolioHolding]
    amount: float
    start_date: str
    end_date: str


@router.post("/lump-sum")
def sim_lump_sum(req: LumpSumRequest):
    try:
        return simulation.lump_sum(req.ticker, req.buy_date, req.amount)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/dca")
def sim_dca(req: DCARequest):
    try:
        return simulation.dca(req.ticker, req.monthly_amount, req.start_date,
                              req.end_date, req.buy_day)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/portfolio")
def sim_portfolio(req: PortfolioRequest):
    try:
        return simulation.portfolio([h.model_dump() for h in req.holdings],
                                    req.amount, req.start_date, req.end_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
