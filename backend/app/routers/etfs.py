"""이식된 프론트가 사용하는 /api/etfs 계약. 내부적으로 repository·insights 재사용.

프론트(ETFWeeklyReport)는 종목을 /etfs 경로로 조회하므로, 기존 /api/stocks와
동일 데이터를 이 계약 형태로 제공한다. (주식·ETF 모두 포함)
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services import comparison, insights, repository

router = APIRouter(prefix="/api/etfs", tags=["etfs"])


def _price_out(row: dict) -> dict:
    """repository 시세 행 → 프론트 PriceData 형태(daily_change_pct 포함)."""
    return {
        "date": row.get("date"),
        "open_price": row.get("open_price"),
        "high_price": row.get("high_price"),
        "low_price": row.get("low_price"),
        "close_price": row.get("close_price"),
        "volume": row.get("volume"),
        "daily_change_pct": row.get("change_pct"),
    }


def _news_out(row: dict) -> dict:
    """repository 뉴스 행 → 프론트 News 형태."""
    return {
        "date": (row.get("pub_date") or "")[:10] or None,
        "published_at": row.get("pub_date"),
        "title": row.get("title"),
        "url": row.get("link"),
        "source": "",
        "relevance_score": None,
    }


@router.get("/")
def list_etfs():
    """추적 종목 목록(주식·ETF, 구매정보 포함). 대시보드·포트폴리오에 사용."""
    stocks = repository.list_stocks_full()
    return [
        {
            "ticker": s["ticker"],
            "name": s["name"],
            "type": s.get("type", "STOCK"),
            "theme": s.get("theme"),
            "purchase_date": s.get("purchase_date"),
            "purchase_price": s.get("purchase_price"),
            "quantity": s.get("quantity"),
            "search_keyword": s.get("search_keyword"),
            "relevance_keywords": s.get("relevance_keywords"),
        }
        for s in stocks
    ]


class BatchSummaryRequest(BaseModel):
    tickers: list[str] = Field(..., max_length=50)
    price_days: int = Field(default=5, ge=1, le=365)
    news_limit: int = Field(default=5, ge=1, le=100)


@router.post("/batch-summary")
def batch_summary(req: BatchSummaryRequest):
    """대시보드 카드용 종목별 요약 배치 조회(N+1 방지)."""
    out: dict[str, dict] = {}
    for ticker in req.tickers:
        prices_asc = repository.get_prices(ticker, days=req.price_days)  # 오래된→최신
        prices_desc = [_price_out(p) for p in reversed(prices_asc)]      # 최신→오래된
        # 주간 수익률: 최신 종가 대비 약 5거래일 전 종가.
        weekly_return = None
        if len(prices_desc) > 5 and prices_desc[0]["close_price"] and prices_desc[5]["close_price"]:
            weekly_return = (prices_desc[0]["close_price"] / prices_desc[5]["close_price"] - 1) * 100

        flow = repository.get_trading_flow(ticker, days=1)
        latest_flow = None
        if flow:
            f = flow[-1]
            latest_flow = {
                "date": f.get("date"),
                "individual_net": f.get("individual_net"),
                "institutional_net": f.get("institutional_net"),
                "foreign_net": f.get("foreign_net"),
            }

        news = repository.get_news(ticker, limit=req.news_limit)
        out[ticker] = {
            "ticker": ticker,
            "latest_price": prices_desc[0] if prices_desc else None,
            "prices": prices_desc,
            "weekly_return": weekly_return,
            "latest_trading_flow": latest_flow,
            "latest_news": [_news_out(n) for n in news],
        }
    return {"data": out}


@router.get("/compare")
def compare_etfs(
    tickers: str = Query(..., description="쉼표 구분 종목 코드(2~20개)"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    """여러 종목 비교: 정규화 가격·통계·상관관계."""
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    if len(ticker_list) < 2:
        raise HTTPException(status_code=400, detail="비교하려면 최소 2개 종목이 필요합니다")
    return comparison.compare(ticker_list[:20], start_date, end_date)


# --- 상세(ETFDetail) 읽기 — 고정 경로 뒤에 배치 -------------------------------

@router.get("/{ticker}")
def get_etf(ticker: str):
    stock = repository.get_stock(ticker)
    if not stock:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
    return {
        "ticker": stock["ticker"],
        "name": stock["name"],
        "type": stock.get("type", "STOCK"),
        "theme": stock.get("theme"),
    }


@router.get("/{ticker}/prices")
def get_etf_prices(ticker: str, days: int = Query(60, ge=1, le=365)):
    # 원본과 동일하게 최신순(date DESC)으로 반환한다(상세의 '최근 가격'은 prices[0]).
    rows = repository.get_prices(ticker, days=days)  # 오래된→최신
    return [_price_out(p) for p in reversed(rows)]


@router.get("/{ticker}/trading-flow")
def get_etf_trading_flow(ticker: str, days: int = Query(20, ge=1, le=120)):
    return repository.get_trading_flow(ticker, days=days)


@router.get("/{ticker}/intraday")
def get_etf_intraday(ticker: str):
    return repository.get_intraday(ticker)


@router.get("/{ticker}/fundamentals")
def get_etf_fundamentals(ticker: str):
    data = repository.get_fundamentals(ticker)
    if data is None:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
    # 구성종목 필드를 프론트 계약(stock_code/stock_name/daily_change_pct)으로 매핑.
    holdings = data.get("holdings")
    if holdings:
        data["holdings"] = [
            {
                "seq": h.get("seq"),
                "stock_code": h.get("item_code"),
                "stock_name": h.get("item_name"),
                "weight": h.get("weight"),
                "daily_change_pct": None,
            }
            for h in holdings
        ]
    return data


@router.get("/{ticker}/insights")
def get_etf_insights(ticker: str, period: str = Query("1m")):
    data = insights.build_insights(ticker, period=period)
    if data is None:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
    return data
