"""설정 화면 계약: 종목 관리(CRUD·정렬·검증·검색) + API 키 + 카탈로그 수집."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services import api_keys, catalog, naver_client, repository

router = APIRouter(prefix="/api/settings", tags=["settings"])


class StockCreate(BaseModel):
    ticker: str
    name: str
    type: str = "STOCK"
    theme: Optional[str] = None
    purchase_date: Optional[str] = None
    purchase_price: Optional[float] = None
    quantity: Optional[int] = None
    search_keyword: Optional[str] = None
    relevance_keywords: Optional[list[str]] = None


class StockUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    theme: Optional[str] = None
    purchase_date: Optional[str] = None
    purchase_price: Optional[float] = None
    quantity: Optional[int] = None
    search_keyword: Optional[str] = None
    relevance_keywords: Optional[list[str]] = None


class ApiKeysUpdate(BaseModel):
    NAVER_CLIENT_ID: Optional[str] = None
    NAVER_CLIENT_SECRET: Optional[str] = None
    PERPLEXITY_API_KEY: Optional[str] = None


# --- 종목 관리 ---------------------------------------------------------------
# 주의: 고정 경로(/stocks/search, /stocks/reorder)를 /stocks/{ticker}보다 먼저.

@router.get("/stocks")
def get_stocks():
    return repository.list_stocks_full()


@router.post("/stocks", status_code=201)
def create_stock(stock: StockCreate):
    try:
        created = repository.create_stock(stock.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {**created, "message": "Stock created successfully"}


@router.get("/stocks/search")
def search_stocks(
    q: str = Query(..., description="검색어(티커 또는 종목명)"),
    type: Optional[str] = Query(None),
):
    if len(q) < 2:
        raise HTTPException(status_code=400, detail="검색어는 최소 2자 이상이어야 합니다")
    stock_type = None if type in (None, "ALL") else type
    return repository.search_catalog(q, stock_type=stock_type, limit=20)


@router.post("/stocks/reorder")
def reorder_stocks(tickers: list[str]):
    count = repository.reorder_stocks(tickers)
    return {"reordered": count}


@router.get("/stocks/{ticker}/validate")
def validate_ticker(ticker: str):
    """네이버 모바일 API로 티커 유효성·기본정보 확인."""
    basic = naver_client.fetch_stock_basic(ticker)
    if not basic or not basic.get("name"):
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
    end_type = basic.get("end_type")
    type_ = "ETF" if end_type == "etf" else "STOCK"
    return {
        "ticker": basic.get("ticker", ticker),
        "name": basic.get("name"),
        "type": type_,
        "theme": None,
        "purchase_date": None,
        "search_keyword": basic.get("name"),
        "relevance_keywords": [basic.get("name")] if basic.get("name") else None,
    }


@router.put("/stocks/{ticker}")
def update_stock(ticker: str, stock: StockUpdate):
    updated = repository.update_stock(ticker, stock.model_dump(exclude_unset=True))
    if updated is None:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
    return {**updated, "message": "Stock updated successfully"}


@router.delete("/stocks/{ticker}")
def delete_stock(ticker: str):
    if not repository.get_stock(ticker):
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
    deleted = repository.delete_stock(ticker)
    return {"ticker": ticker, "deleted": deleted}


# --- 카탈로그 수집(시총 상위 종목 자동 확장) ---------------------------------

@router.post("/ticker-catalog/collect")
def collect_ticker_catalog(limit: int | None = Query(None, ge=1, le=10000)):
    """전체 종목 목록 카탈로그 수집(KOSPI+KOSDAQ 전 종목). 프론트 계약(카운트) 반환.

    limit 미지정 시 각 시장 전체를 수집한다(원본과 동일).
    """
    return catalog.sync_catalog_detailed(limit=limit)


@router.get("/ticker-catalog/collect-progress")
def ticker_catalog_progress():
    # 카탈로그 수집은 동기 처리라 별도 진행상태를 두지 않는다(항상 idle).
    return {"is_collecting": False, "status": "idle"}


# --- API 키 ------------------------------------------------------------------

@router.get("/api-keys")
def get_api_keys(raw: bool = Query(False)):
    return api_keys.get_keys(raw=raw)


@router.put("/api-keys")
def update_api_keys(data: ApiKeysUpdate):
    return api_keys.update_keys(data.model_dump(exclude_unset=True))
