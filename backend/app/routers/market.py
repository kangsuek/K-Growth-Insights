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


@router.get("/index/{code}/intraday")
def index_intraday(code: str):
    """지수 분봉. code: KOSPI|KOSDAQ.

    프론트가 종목 분봉 차트(IntradayChart)를 그대로 재사용할 수 있도록
    /api/etfs/{ticker}/intraday와 같은 필드 이름(open_price/high_price/low_price/
    price/volume/datetime)으로 맞춘다.
    """
    if code not in naver_client.INDEX_NAMES:
        return {"code": code, "data": [], "count": 0, "first_time": None, "last_time": None}

    rows = naver_client.fetch_index_intraday(code)

    # 전일 종가 대비 변동(전일비·상승률) — basic API의 등락폭으로 역산한다.
    basic = naver_client.fetch_index_basic(code)
    prev_close = None
    if basic and basic.get("close_price") is not None and basic.get("change") is not None:
        prev_close = basic["close_price"] - basic["change"]
    for r in rows:
        if prev_close is not None and r.get("price") is not None:
            r["change_amount"] = round(r["price"] - prev_close, 2)
            if prev_close:
                r["change_pct"] = round((r["price"] - prev_close) / prev_close * 100, 2)

    if not rows:
        return {
            "code": code, "name": naver_client.INDEX_NAMES[code],
            "date": None, "data": [], "count": 0, "first_time": None, "last_time": None,
        }

    date_ = rows[0]["datetime"][:10]
    first_time = rows[0]["datetime"].split("T")[1][:5]
    last_time = rows[-1]["datetime"].split("T")[1][:5]
    return {
        "code": code, "name": naver_client.INDEX_NAMES[code],
        "date": date_, "data": rows, "count": len(rows),
        "first_time": first_time, "last_time": last_time,
    }
