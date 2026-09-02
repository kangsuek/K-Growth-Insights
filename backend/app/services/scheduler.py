"""APScheduler 기반 자동 수집 스케줄러.

- 정기 수집: 평일 09:00:05부터 15:40 KST까지, 별도 주기(설정의 '데이터 자동
  수집 주기', 기본 10분)로 종목관리 등록 종목의 일별 시세·수급·펀더멘털을
  수집하는 interval_collect 잡이 전담한다(분봉은 여기서 수집하지 않는다 —
  collectors.collect_stock이 분봉을 호출하지 않으므로). 서버 기동 시각이 아니라
  CronTrigger로 정각+5초에 정렬한다.
- 분봉 수집: 평일 09:00:10부터 15:40 KST까지, 별도 주기(설정의 '분봉 자동 수집
  주기', 기본 1분)로 분봉만 수집하는 intraday_collect 잡이 전담한다. 다른 잡과
  중복 수집하지 않는다(분봉은 일별 데이터보다 훨씬 자주 바뀌므로
  COLLECT_INTERVAL_MINUTES와 분리하며, 서버 기동 시각이 아니라 CronTrigger로
  정각+10초에 정렬한다)
- 마감 수집: 평일 15:40 KST 종가 확정 시점 전체 수집(분봉 제외)

collectors가 동기(httpx.Client)이므로 이벤트 루프를 막지 않도록 스레드 기반
BackgroundScheduler를 사용한다. 서버 lifespan에서 start/shutdown 한다.
"""
from __future__ import annotations

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app import config
from app.services import alerts, collectors, repository
from app.timeutil import KST, MARKET_CLOSE, MARKET_OPEN, is_market_hours  # noqa: F401

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def run_collect_all(reason: str) -> dict:
    """추적 전체 종목을 수집하고 성공/실패 요약을 로깅·반환한다."""
    stocks = repository.list_stocks()
    succeeded = 0
    for s in stocks:
        result = collectors.collect_stock(s["ticker"])
        if result.ok:
            succeeded += 1
            try:
                alerts.check_signal_rules_after_daily_collect(s["ticker"])
            except Exception:  # noqa: BLE001 - 알림 판정 실패가 수집 자체를 막지 않게
                logger.warning("[scheduler:%s] 신호 알림 판정 실패: %s", reason, s["ticker"])
    summary = {"total": len(stocks), "succeeded": succeeded}
    logger.info("[scheduler:%s] 수집 완료 %d/%d", reason, succeeded, len(stocks))
    return summary


def run_collect_intraday_all(reason: str) -> dict:
    """추적 전체 종목의 분봉만 수집하고 성공/실패 요약을 로깅·반환한다."""
    stocks = repository.list_stocks()
    succeeded = 0
    for s in stocks:
        try:
            collectors.collect_intraday(s["ticker"])
            succeeded += 1
            alerts.check_price_rules_after_intraday_collect(s["ticker"])
        except Exception:  # noqa: BLE001 - 한 종목 실패가 나머지를 막지 않게
            logger.warning("[scheduler:%s] 분봉 수집 실패: %s", reason, s["ticker"])
    summary = {"total": len(stocks), "succeeded": succeeded}
    logger.info("[scheduler:%s] 분봉 수집 완료 %d/%d", reason, succeeded, len(stocks))
    return summary


def _in_market_hours_at_minute() -> bool:
    """CronTrigger가 정각+N초에 실행되므로, 초 단위를 잘라 비교해 장 마감 정각
    (15:40:00)과의 초 단위 오차로 마지막 15:40 수집이 걸러지지 않게 한다."""
    now = datetime.now(KST).replace(second=0, microsecond=0)
    return is_market_hours(now)


def _interval_job() -> None:
    if not _in_market_hours_at_minute():
        return
    run_collect_all("interval")


def _intraday_interval_job() -> None:
    if not _in_market_hours_at_minute():
        return
    run_collect_intraday_all("intraday-interval")


def _daily_close_job() -> None:
    run_collect_all("daily-close")


def _market_cron(minutes: int, second: int) -> CronTrigger:
    """장중(평일 09:00~15:59) 정각+`second`초부터 매 `minutes`분마다 도는 트리거."""
    return CronTrigger(
        day_of_week="mon-fri",
        hour="9-15",
        minute=f"*/{minutes}",
        second=second,
        timezone=KST,
    )


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
        # 09:00:05부터 매 N분마다 실행(서버 기동 시각이 아닌 정각+5초 기준 정렬).
        # 분봉 잡(정각+10초)보다 5초 앞서 실행해 시세·수급을 먼저 채운다.
        _market_cron(config.COLLECT_INTERVAL_MINUTES, second=5),
        id="interval_collect",
        replace_existing=True,
        max_instances=1,  # 이전 실행이 안 끝났으면 중복 실행 금지
        coalesce=True,     # 밀린 실행은 1회로 합침
    )
    scheduler.add_job(
        _intraday_interval_job,
        # 09:00:10부터 매 N분마다 실행(서버 기동 시각이 아닌 정각+10초 기준 정렬).
        # 09:00:00 정각 대신 10초 여유를 둬 개장 직후 네이버 분봉이 아직
        # 생성되지 않은 시점에 빈 응답을 받는 것을 피한다.
        _market_cron(config.INTRADAY_COLLECT_INTERVAL_MINUTES, second=10),
        id="intraday_collect",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
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
        "스케줄러 시작: 장중 %d분 간격(일별) + %d분 간격(분봉) + 평일 15:40 KST 마감 수집",
        config.COLLECT_INTERVAL_MINUTES,
        config.INTRADAY_COLLECT_INTERVAL_MINUTES,
    )
    return scheduler


def update_intraday_interval(minutes: int) -> None:
    """분봉 수집 주기를 변경한다. 실행 중인 스케줄러가 있으면 해당 잡을 즉시 재등록한다.

    스케줄러가 아직 기동 전(설정 로드 시점)이면 config 값만 갱신되고,
    이후 start()가 이 값으로 잡을 등록한다.
    """
    config.INTRADAY_COLLECT_INTERVAL_MINUTES = minutes
    if _scheduler and _scheduler.running:
        _scheduler.reschedule_job("intraday_collect", trigger=_market_cron(minutes, second=10))
        logger.info("분봉 수집 잡 재등록: %d분 간격", minutes)


def update_collect_interval(minutes: int) -> None:
    """일별 시세·수급·펀더멘털 수집 주기를 변경한다. 실행 중인 스케줄러가 있으면
    해당 잡을 즉시 재등록한다.

    스케줄러가 아직 기동 전(설정 로드 시점)이면 config 값만 갱신되고,
    이후 start()가 이 값으로 잡을 등록한다.
    """
    config.COLLECT_INTERVAL_MINUTES = minutes
    if _scheduler and _scheduler.running:
        _scheduler.reschedule_job("interval_collect", trigger=_market_cron(minutes, second=5))
        logger.info("데이터 자동 수집 잡 재등록: %d분 간격", minutes)


def shutdown() -> None:
    """스케줄러를 정리한다(진행 중 작업은 대기하지 않음)."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("스케줄러 종료")
    _scheduler = None
