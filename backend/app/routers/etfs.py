"""이식된 프론트가 사용하는 /api/etfs 계약. 내부적으로 repository·insights 재사용.

프론트(ETFWeeklyReport)는 종목을 /etfs 경로로 조회하므로, 기존 /api/stocks와
동일 데이터를 이 계약 형태로 제공한다. (주식·ETF 모두 포함)
"""
from __future__ import annotations

import logging
import threading

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services import collectors, comparison, insights, repository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/etfs", tags=["etfs"])

# 분봉 백그라운드 수집 상태(중복 실행 방지). 프론트는 background_collect_started가
# 참인 동안 3초 간격으로 폴링해 수집 완료를 감지한다.
_intraday_collecting: set[str] = set()
_intraday_lock = threading.Lock()


def _start_intraday_collect(ticker: str) -> bool:
    """분봉 백그라운드 수집을 시작한다. 이미 수집 중이면 새로 시작하지 않는다.

    반환값은 "수집이 진행 중인가"이며, 새로 시작했든 이미 돌고 있든 True다.
    """
    with _intraday_lock:
        if ticker in _intraday_collecting:
            return True
        _intraday_collecting.add(ticker)

    def _run() -> None:
        try:
            collectors.collect_intraday(ticker)
        except Exception as exc:  # noqa: BLE001 - 로깅 후 상태만 해제
            logger.warning("분봉 백그라운드 수집 실패(%s): %s", ticker, exc)
        finally:
            with _intraday_lock:
                _intraday_collecting.discard(ticker)

    threading.Thread(target=_run, daemon=True).start()
    return True


def _intraday_response(
    ticker: str, target_date: str | None, auto_collect: bool, force_refresh: bool
) -> dict:
    """프론트 계약(ETFWeeklyReport)과 동일한 분봉 응답을 구성한다.

    당일 분봉이 없으면 repository가 가장 최근 거래일로 폴백하므로, 직전 거래일
    데이터가 그대로 표시된다. 데이터가 아예 없거나 force_refresh면 백그라운드
    수집을 트리거하고 background_collect_started 플래그를 실어 보낸다.
    """
    actual_date, rows = repository.get_intraday_dated(ticker, target_date)

    # 전일 종가 대비 변동(전일비·상승률)을 계산해 막대 색상·툴팁·% 축에 쓰이게 한다.
    prev_close = repository.close_before(ticker, actual_date) if actual_date else None
    for r in rows:
        if prev_close is not None and r.get("price") is not None:
            r["change_amount"] = round(r["price"] - prev_close, 2)
            if prev_close:
                r["change_pct"] = round((r["price"] - prev_close) / prev_close * 100, 2)

    bg_started = False
    if auto_collect and (not rows or force_refresh):
        bg_started = _start_intraday_collect(ticker)

    if not rows:
        return {
            "ticker": ticker,
            "date": actual_date,
            "data": [],
            "count": 0,
            "first_time": None,
            "last_time": None,
            "background_collect_started": bg_started,
            "message": (
                "분봉 데이터 수집 중입니다. 잠시 후 자동으로 갱신됩니다."
                if bg_started
                else "데이터 없음 (장 마감 또는 휴장일)"
            ),
        }

    first_time = rows[0]["datetime"].split("T")[1][:5]
    last_time = rows[-1]["datetime"].split("T")[1][:5]
    response = {
        "ticker": ticker,
        "date": actual_date,
        "data": rows,
        "count": len(rows),
        "first_time": first_time,
        "last_time": last_time,
    }
    if bg_started:
        response["background_collect_started"] = True
    return response


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
def get_etf_prices(
    ticker: str,
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    days: int = Query(60, ge=1, le=1000),
    auto_collect: bool = Query(True),
):
    # 기간(start/end)이 오면 그 범위, 아니면 최근 days일. 최신순(DESC)으로 반환.
    if start_date or end_date:
        if auto_collect and start_date:
            _ensure_coverage("prices", ticker, start_date,
                             repository.prices_earliest_date(ticker),
                             lambda n: collectors.collect_prices(ticker, days=n))
        rows = repository.get_prices_range(ticker, start_date, end_date)
    else:
        rows = repository.get_prices(ticker, days=days)  # 오래된→최신
    return [_price_out(p) for p in reversed(rows)]


# 기간 조회 백필: 종목별로 이미 시도한 가장 이른 start_date를 기억해 중복 수집 방지.
# (API가 더 과거를 안 주는 경우 매 요청마다 재수집하는 것을 막는다.) 종류별로 분리.
_backfilled: dict[str, dict[str, str]] = {"prices": {}, "flow": {}}
_backfill_lock = threading.Lock()


def _ensure_coverage(kind: str, ticker: str, start_date: str,
                     earliest: str | None, collect) -> None:
    """보유 데이터가 start_date를 못 덮으면 그만큼 과거 이력을 백필 수집한다.

    시세·매매동향 모두 한 번의 수집으로는 최근 구간만 채워져, 기간을 길게 잡으면
    차트가 짧게 나온다(두 차트는 정렬되어야 함). 부족분을 collect(days)로 채운다.
    """
    from datetime import date

    if earliest and earliest <= start_date:
        return  # 이미 커버됨
    with _backfill_lock:
        tried = _backfilled[kind].get(ticker)
        if tried and tried <= start_date:
            return  # 이 기간까지 이미 백필 시도함(더 과거 데이터 없음)
        _backfilled[kind][ticker] = start_date
    try:
        d0 = date.fromisoformat(start_date)
    except ValueError:
        return
    days_needed = (date.today() - d0).days + 5  # 경계 여유
    try:
        collect(days_needed)
    except Exception as exc:  # noqa: BLE001 - 실패해도 보유분으로 응답
        logger.warning("%s 백필 실패(%s): %s", kind, ticker, exc)


@router.get("/{ticker}/trading-flow")
def get_etf_trading_flow(
    ticker: str,
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    days: int = Query(20, ge=1, le=1000),
    auto_collect: bool = Query(True),
):
    if start_date or end_date:
        if auto_collect and start_date:
            _ensure_coverage("flow", ticker, start_date,
                             repository.trading_flow_earliest_date(ticker),
                             lambda n: collectors.collect_trading_flow(ticker, days=n))
        return repository.get_trading_flow_range(ticker, start_date, end_date)
    return repository.get_trading_flow(ticker, days=days)


@router.get("/{ticker}/intraday")
def get_etf_intraday(
    ticker: str,
    target_date: str | None = Query(None),
    auto_collect: bool = Query(True),
    force_refresh: bool = Query(False),
):
    return _intraday_response(ticker, target_date, auto_collect, force_refresh)


@router.get("/{ticker}/fundamentals")
def get_etf_fundamentals(ticker: str):
    data = repository.get_fundamentals(ticker)
    if data is None:
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
    # 구성종목 필드를 프론트 계약(stock_code/stock_name/daily_change_pct)으로 매핑.
    # 전일대비는 모바일 구성종목 응답에 없어, 각 구성종목 코드로 등락률을 조회해 채운다.
    # (해외자산·선물처럼 코드가 없는 구성종목은 조회 불가라 None으로 남는다.)
    holdings = data.get("holdings")
    if holdings:
        changes = repository.latest_change_pct([h.get("item_code") for h in holdings])
        data["holdings"] = [
            {
                "seq": h.get("seq"),
                "stock_code": h.get("item_code"),
                "stock_name": h.get("item_name"),
                "weight": h.get("weight"),
                "daily_change_pct": changes.get(h.get("item_code")),
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
