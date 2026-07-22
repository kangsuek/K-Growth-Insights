"""시장 지수(코스피/코스닥) 조회 엔드포인트. 네이버 모바일 index API 기반."""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.services import naver_client

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/overview")
def market_overview():
    """코스피·코스닥 현재가·등락 현황."""
    indices = []
    for code in naver_client.INDEX_NAMES:
        data = naver_client.fetch_index_basic(code)
        if data:
            indices.append(data)
    return {"indices": indices}


@router.get("/index/{code}/chart")
def index_chart(code: str, period: str = Query("3M")):
    """지수 일별 차트. code: KOSPI|KOSDAQ, period: 1M|3M|6M|1Y|3Y."""
    if code not in naver_client.INDEX_NAMES:
        return {"code": code, "period": period, "data": []}
    rows = naver_client.fetch_index_chart(code, period)
    data = [
        {
            "date": r["date"],
            "close": r["close_price"],
            "open": r["open_price"],
            "high": r["high_price"],
            "low": r["low_price"],
        }
        for r in rows
        if r.get("date") and r.get("close_price") is not None
    ]
    return {"code": code, "name": naver_client.INDEX_NAMES[code], "period": period, "data": data}
