"""종목 발굴(Screening) 엔드포인트 — stock_catalog 기반 검색·테마·추천·수집."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Query

from app.services import scanner

router = APIRouter(prefix="/api/scanner", tags=["scanner"])


@router.get("")
def search_scanner(
    q: Optional[str] = Query(None),
    type: str = Query("ETF"),
    market: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    min_weekly_return: Optional[float] = Query(None),
    max_weekly_return: Optional[float] = Query(None),
    min_monthly_return: Optional[float] = Query(None),
    max_monthly_return: Optional[float] = Query(None),
    min_ytd_return: Optional[float] = Query(None),
    max_ytd_return: Optional[float] = Query(None),
    foreign_net_positive: Optional[bool] = Query(None),
    institutional_net_positive: Optional[bool] = Query(None),
    sort_by: str = Query("weekly_return"),
    sort_dir: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
):
    return scanner.search({
        "q": q, "type": type, "market": market, "sector": sector,
        "min_weekly_return": min_weekly_return, "max_weekly_return": max_weekly_return,
        "min_monthly_return": min_monthly_return, "max_monthly_return": max_monthly_return,
        "min_ytd_return": min_ytd_return, "max_ytd_return": max_ytd_return,
        "foreign_net_positive": foreign_net_positive,
        "institutional_net_positive": institutional_net_positive,
        "sort_by": sort_by, "sort_dir": sort_dir, "page": page, "page_size": page_size,
    })


@router.get("/themes")
def get_themes():
    return scanner.themes()


@router.get("/recommendations")
def get_recommendations(limit: int = Query(5, ge=1, le=10)):
    return scanner.recommendations(limit=limit)


@router.get("/collect-progress")
def get_collect_progress():
    return scanner.get_progress()


@router.post("/collect-data")
def collect_data(
    background_tasks: BackgroundTasks,
    force: bool = Query(False, description="freshness 가드를 무시하고 강제 재수집"),
):
    """카탈로그 지표 수집을 백그라운드로 시작. 진행률은 /collect-progress 폴링.

    force=false이고 이미 최신이면 수집하지 않고 fresh를 반환한다. 프론트는 진행률
    배너 대신 "이미 최신입니다" 안내로 재수집 여부를 확인한다.
    """
    if scanner.get_progress().get("status") == "in_progress":
        return {"message": "이미 데이터 수집이 진행 중입니다", "status": "already_running"}
    if not force:
        freshness = scanner.check_freshness()
        if freshness["fresh"]:
            return {
                "message": "이미 최신 데이터입니다",
                "status": "fresh",
                "skipped": True,
                "last_updated": freshness["last_updated"],
            }
    background_tasks.add_task(scanner.collect_catalog_data)
    return {"message": "카탈로그 데이터 수집이 시작되었습니다", "status": "started"}


@router.post("/cancel-collect")
def cancel_collect():
    scanner.cancel_collect()
    return {"message": "수집 취소 요청됨", "status": "cancelling"}
