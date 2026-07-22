"""Data collection endpoints (Naver mobile API -> SQLite)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models import CollectResult
from app.services import (
    catalog,
    collectors,
    jobs,
    naver_client,
    repository,
    scheduler,
    stocks_sync,
)

router = APIRouter(prefix="/api/data", tags=["data"])


@router.post("/sync-stocks")
def sync_stocks():
    count = stocks_sync.sync_stocks(refresh_from_api=True)
    return {"synced": count}


@router.post("/sync-catalog")
def sync_catalog(
    market: str | None = Query(None, description="KOSPI 또는 KOSDAQ, 생략 시 둘 다"),
    limit: int = Query(100, ge=1, le=1000, description="시장별 시총 상위 N 종목"),
):
    if market is not None and market not in naver_client.MARKETS:
        raise HTTPException(status_code=400, detail="market은 KOSPI 또는 KOSDAQ이어야 합니다")
    return {"synced": catalog.sync_catalog(market=market, limit=limit)}


@router.post("/collect/{ticker}", response_model=CollectResult)
def collect_one(ticker: str):
    if not repository.get_stock(ticker):
        raise HTTPException(status_code=404, detail="종목을 찾을 수 없습니다")
    return collectors.collect_stock(ticker)


@router.post("/collect-all")
def collect_all():
    """전체 수집을 백그라운드로 시작하고 즉시 진행 상태를 반환한다."""
    started = jobs.start()
    return {"started": started, **jobs.snapshot()}


@router.get("/collect-status")
def collect_status():
    """전체 수집 진행률(폴링용)."""
    return jobs.snapshot()


@router.get("/collect-progress")
def collect_progress():
    """이식 프론트 호환: 수집 진행률(collect-status 별칭 형태)."""
    snap = jobs.snapshot()
    return {
        "is_collecting": snap["status"] == "running",
        "total": snap["total"],
        "completed": snap["completed"],
        "current": snap["current"],
        "status": snap["status"],
    }


@router.get("/scheduler-status")
def scheduler_status():
    """스케줄러 상태 + 마지막 수집 시각(프론트 대시보드/푸터용)."""
    running = scheduler._scheduler is not None and scheduler._scheduler.running
    next_run = None
    if running:
        for job in scheduler._scheduler.get_jobs():
            if job.id == "interval_collect" and job.next_run_time:
                next_run = job.next_run_time.isoformat()
    return {
        "scheduler": {
            "is_running": running,
            "last_collection_time": repository.last_collection_time(),
            "next_collection_time": next_run,
        }
    }


@router.delete("/reset")
def reset_data():
    """수집 데이터 초기화(종목 목록은 유지)."""
    deleted = repository.reset_collected_data()
    return {"reset": True, "deleted": deleted}


@router.get("/stats")
def stats():
    return repository.data_stats()
