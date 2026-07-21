"""APScheduler 기반 자동 수집 스케줄러.

- 정기 수집: 장중(평일 09:00~15:40 KST)에 N분마다 전체 종목 수집
- 마감 수집: 평일 15:40 KST 종가 확정 시점 전체 수집

collectors가 동기(httpx.Client)이므로 이벤트 루프를 막지 않도록 스레드 기반
BackgroundScheduler를 사용한다. 서버 lifespan에서 start/shutdown 한다.
"""
from __future__ import annotations

import logging
from datetime import datetime, time
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app import config
from app.services import collectors, repository

logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")
MARKET_OPEN = time(9, 0)
MARKET_CLOSE = time(15, 40)

_scheduler: BackgroundScheduler | None = None


def is_market_hours(now: datetime | None = None) -> bool:
    """평일 정규장 시간(09:00~15:40 KST) 여부."""
    now = now or datetime.now(KST)
    if now.weekday() >= 5:  # 5=토, 6=일
        return False
    return MARKET_OPEN <= now.time() <= MARKET_CLOSE


def run_collect_all(reason: str) -> dict:
    """추적 전체 종목을 수집하고 성공/실패 요약을 로깅·반환한다."""
    stocks = repository.list_stocks()
    succeeded = 0
    for s in stocks:
        result = collectors.collect_stock(s["ticker"])
        if result.ok:
            succeeded += 1
    summary = {"total": len(stocks), "succeeded": succeeded}
    logger.info("[scheduler:%s] 수집 완료 %d/%d", reason, succeeded, len(stocks))
    return summary


def _interval_job() -> None:
    # 장 시간이 아니면 건너뛴다(불필요한 오프아워 수집 방지).
    if not is_market_hours():
        return
    run_collect_all("interval")


def _daily_close_job() -> None:
    run_collect_all("daily-close")


def start() -> BackgroundScheduler | None:
    """스케줄러를 기동한다. 비활성화 상태면 None 반환."""
    global _scheduler
    if not config.SCHEDULER_ENABLED:
        logger.info("스케줄러 비활성화(SCHEDULER_ENABLED=false)")
        return None
    if _scheduler and _scheduler.running:
        return _scheduler

    scheduler = BackgroundScheduler(timezone=KST)
    scheduler.add_job(
        _interval_job,
        IntervalTrigger(minutes=config.COLLECT_INTERVAL_MINUTES),
        id="interval_collect",
        replace_existing=True,
        max_instances=1,  # 이전 실행이 안 끝났으면 중복 실행 금지
        coalesce=True,     # 밀린 실행은 1회로 합침
    )
    scheduler.add_job(
        _daily_close_job,
        CronTrigger(day_of_week="mon-fri", hour=15, minute=40, timezone=KST),
        id="daily_close_collect",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "스케줄러 시작: 장중 %d분 간격 + 평일 15:40 KST 마감 수집",
        config.COLLECT_INTERVAL_MINUTES,
    )
    return scheduler


def shutdown() -> None:
    """스케줄러를 정리한다(진행 중 작업은 대기하지 않음)."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("스케줄러 종료")
    _scheduler = None
