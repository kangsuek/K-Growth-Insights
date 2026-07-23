"""설정 화면 계약: 종목 관리(CRUD·정렬·검증·검색) + API 키 + 카탈로그 수집."""
from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services import api_keys, catalog, naver_client, repository

router = APIRouter(prefix="/api/settings", tags=["settings"])

# 자동 입력 키워드 제안용. 발행사·브랜드 접두어는 뉴스 검색 노이즈라 제거한다
# (원본 ETFWeeklyReport ticker_scraper 규칙 이식).
_BRAND_RE = re.compile(r"\b(삼성|신한|KB|KoAct|KODEX|SOL|RISE|HD|한화|두산|TIGER|ACE|PLUS|HANARO)\b")
_ETF_RE = re.compile(r"\bETF\b")


def _clean_name(name: str) -> str:
    """종목명에서 발행사·브랜드·ETF 표기를 제거. 비면 원래 이름 반환."""
    cleaned = _ETF_RE.sub("", _BRAND_RE.sub("", name)).strip()
    return cleaned or name


def _suggest_keywords(name: str, theme: str | None) -> list[str]:
    """종목명 + 테마(섹터)를 조합한 관련 키워드 목록(중복 제거, 최대 10개).

    원본 generate_keywords와 동일: 브랜드 제거 후 종목명 단어 + 테마 단어를
    분해해 합치고, 맨 앞에 원래 종목명을 둔다.
    """
    keywords: list[str] = []
    for w in re.split(r"[\s\-/]+", _clean_name(name)):
        if len(w) > 1:
            keywords.append(w)
    if theme:
        for w in re.split(r"[/\s]+", theme):
            if len(w) > 1:
                keywords.append(w)
    keywords = list(dict.fromkeys(keywords))  # 순서 유지 중복 제거
    if name not in keywords:
        keywords.insert(0, name)
    return keywords[:10]


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
    name = basic.get("name")
    # 이름 기반 섹터(_SECTOR_KEYWORDS)로 테마를 추론하고, 이를 종목명과 조합해
    # 뉴스 검색 키워드·관련 키워드를 함께 제안한다(자동 입력 시 폼에 채워짐).
    theme = catalog.match_sector(name)
    return {
        "ticker": basic.get("ticker", ticker),
        "name": name,
        "type": type_,
        "theme": theme,
        "purchase_date": None,
        "search_keyword": _clean_name(name) if name else None,
        "relevance_keywords": _suggest_keywords(name, theme) if name else None,
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
    """종목목록수집 진행률(코스피→코스닥→ETF→저장 단계). 동시 폴링용."""
    return catalog.get_progress()


@router.delete("/ticker-catalog")
def clear_ticker_catalog():
    """발굴 카탈로그(stock_catalog) 전체 삭제."""
    deleted = catalog.clear_catalog()
    return {"deleted": deleted}


# --- API 키 ------------------------------------------------------------------

@router.get("/api-keys")
def get_api_keys(raw: bool = Query(False)):
    return api_keys.get_keys(raw=raw)


@router.put("/api-keys")
def update_api_keys(data: ApiKeysUpdate):
    return api_keys.update_keys(data.model_dump(exclude_unset=True))
