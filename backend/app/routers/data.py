"""Data collection endpoints (Naver mobile API -> SQLite)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import CollectAllResult, CollectResult
from app.services import collectors, repository, stocks_sync

router = APIRouter(prefix="/api/data", tags=["data"])


@router.post("/sync-stocks")
def sync_stocks():
    count = stocks_sync.sync_stocks(refresh_from_api=True)
    return {"synced": count}


@router.post("/collect/{ticker}", response_model=CollectResult)
def collect_one(ticker: str):
    if not repository.get_stock(ticker):
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
    return collectors.collect_stock(ticker)


@router.post("/collect-all", response_model=CollectAllResult)
def collect_all():
    stocks = repository.list_stocks()
    results = [collectors.collect_stock(s["ticker"]) for s in stocks]
    succeeded = sum(1 for r in results if r.ok)
    return CollectAllResult(
        total=len(results),
        succeeded=succeeded,
        failed=len(results) - succeeded,
        results=results,
    )


@router.get("/stats")
def stats():
    return repository.data_stats()
