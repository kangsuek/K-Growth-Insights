"""작업 5(스케줄러) 테스트: 장중 판정·전체 수집 요약·잡 등록.

실제 BackgroundScheduler를 장시간 돌리지 않고, 순수 로직과 잡 구성만 검증한다.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from app import config
from app.services import scheduler
from tests.conftest import seed_stock

KST = ZoneInfo("Asia/Seoul")


# --- 장중 판정 ---------------------------------------------------------------

def test_is_market_hours_weekday_open():
    # 2026-07-22(수) 10:00 KST → 장중
    assert scheduler.is_market_hours(datetime(2026, 7, 22, 10, 0, tzinfo=KST))


def test_is_market_hours_before_open_and_after_close():
    assert not scheduler.is_market_hours(datetime(2026, 7, 22, 8, 59, tzinfo=KST))
    assert not scheduler.is_market_hours(datetime(2026, 7, 22, 15, 41, tzinfo=KST))


def test_is_market_hours_weekend():
    # 2026-07-25(토), 2026-07-26(일)
    assert not scheduler.is_market_hours(datetime(2026, 7, 25, 11, 0, tzinfo=KST))
    assert not scheduler.is_market_hours(datetime(2026, 7, 26, 11, 0, tzinfo=KST))


def test_is_market_hours_boundaries():
    assert scheduler.is_market_hours(datetime(2026, 7, 22, 9, 0, tzinfo=KST))
    assert scheduler.is_market_hours(datetime(2026, 7, 22, 15, 40, tzinfo=KST))


# --- 전체 수집 요약 -----------------------------------------------------------

def test_run_collect_all_counts_success(monkeypatch):
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")

    class _R:
        def __init__(self, ok):
            self.ok = ok

    calls = []

    def fake_collect(ticker):
        calls.append(ticker)
        return _R(ticker != "000660")  # 000660만 실패로 가정

    monkeypatch.setattr(scheduler.collectors, "collect_stock", fake_collect)
    summary = scheduler.run_collect_all("test")
    assert summary == {"total": 2, "succeeded": 1}
    assert set(calls) == {"005930", "000660"}


def test_interval_job_skips_outside_market_hours(monkeypatch):
    called = {"n": 0}
    monkeypatch.setattr(scheduler, "is_market_hours", lambda now=None: False)
    monkeypatch.setattr(scheduler, "run_collect_all", lambda reason: called.__setitem__("n", called["n"] + 1))
    scheduler._interval_job()
    assert called["n"] == 0


def test_interval_job_runs_during_market_hours(monkeypatch):
    called = {"n": 0}
    monkeypatch.setattr(scheduler, "is_market_hours", lambda now=None: True)
    monkeypatch.setattr(scheduler, "run_collect_all", lambda reason: called.__setitem__("n", called["n"] + 1))
    scheduler._interval_job()
    assert called["n"] == 1


# --- 분봉 전용 수집 -----------------------------------------------------------

def test_run_collect_intraday_all_counts_success(monkeypatch):
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")

    calls = []

    def fake_collect_intraday(ticker):
        calls.append(ticker)
        if ticker == "000660":
            raise RuntimeError("boom")
        return 1

    monkeypatch.setattr(scheduler.collectors, "collect_intraday", fake_collect_intraday)
    summary = scheduler.run_collect_intraday_all("test")
    assert summary == {"total": 2, "succeeded": 1}
    assert set(calls) == {"005930", "000660"}


def test_intraday_interval_job_skips_outside_market_hours(monkeypatch):
    called = {"n": 0}
    monkeypatch.setattr(scheduler, "is_market_hours", lambda now=None: False)
    monkeypatch.setattr(
        scheduler, "run_collect_intraday_all", lambda reason: called.__setitem__("n", called["n"] + 1)
    )
    scheduler._intraday_interval_job()
    assert called["n"] == 0


def test_intraday_interval_job_runs_during_market_hours(monkeypatch):
    called = {"n": 0}
    monkeypatch.setattr(scheduler, "is_market_hours", lambda now=None: True)
    monkeypatch.setattr(
        scheduler, "run_collect_intraday_all", lambda reason: called.__setitem__("n", called["n"] + 1)
    )
    scheduler._intraday_interval_job()
    assert called["n"] == 1


def _freeze_now(monkeypatch, fixed):
    """scheduler.datetime.now(KST)가 fixed를 반환하도록 고정한다."""
    class _FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed

    monkeypatch.setattr(scheduler, "datetime", _FixedDatetime)


def test_intraday_interval_job_still_collects_at_close_second_10(monkeypatch):
    """CronTrigger는 매 분 10초에 실행된다. 장 마감 정각(15:40)에도 실제 실행
    시각은 15:40:10이라, 초 단위를 자르지 않고 is_market_hours()에 그대로
    넘기면 15:40:00보다 늦어 마지막 15:40 분봉을 놓친다.
    """
    _freeze_now(monkeypatch, datetime(2026, 7, 22, 15, 40, 10, tzinfo=KST))  # 수요일
    called = {"n": 0}
    monkeypatch.setattr(
        scheduler, "run_collect_intraday_all", lambda reason: called.__setitem__("n", called["n"] + 1)
    )
    scheduler._intraday_interval_job()
    assert called["n"] == 1


def test_intraday_interval_job_stops_right_after_close(monkeypatch):
    """15:41(장 마감 다음 분)부터는 실행되지 않는다."""
    _freeze_now(monkeypatch, datetime(2026, 7, 22, 15, 41, 10, tzinfo=KST))
    called = {"n": 0}
    monkeypatch.setattr(
        scheduler, "run_collect_intraday_all", lambda reason: called.__setitem__("n", called["n"] + 1)
    )
    scheduler._intraday_interval_job()
    assert called["n"] == 0


# --- 기동/정리 ---------------------------------------------------------------

def test_start_disabled_returns_none(monkeypatch):
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    assert scheduler.start() is None


def test_start_registers_jobs_and_shutdown(monkeypatch):
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", True)
    monkeypatch.setattr(config, "COLLECT_INTERVAL_MINUTES", 10)
    sched = scheduler.start()
    try:
        assert sched is not None
        job_ids = {j.id for j in sched.get_jobs()}
        assert job_ids == {"interval_collect", "intraday_collect", "daily_close_collect"}
    finally:
        scheduler.shutdown()
    assert scheduler._scheduler is None


def test_intraday_job_uses_cron_trigger_aligned_to_clock(monkeypatch):
    """서버 기동 시각이 아니라 정각+10초(09:00:10 등) 기준으로 정렬돼야 한다."""
    from apscheduler.triggers.cron import CronTrigger

    monkeypatch.setattr(config, "SCHEDULER_ENABLED", True)
    monkeypatch.setattr(config, "INTRADAY_COLLECT_INTERVAL_MINUTES", 1)
    sched = scheduler.start()
    try:
        job = sched.get_job("intraday_collect")
        assert isinstance(job.trigger, CronTrigger)

        # 서버가 09:07:23에 떴다고 가정해도 다음 실행은 09:08:10처럼 정각+10초에 걸려야 한다.
        now = datetime(2026, 8, 10, 9, 7, 23, tzinfo=KST)
        next_run = job.trigger.get_next_fire_time(None, now)
        assert next_run.second == 10 and next_run.microsecond == 0

        # 장 시작 직전(08:59:50)이면 첫 실행은 09:00:10이어야 한다.
        before_open = datetime(2026, 8, 10, 8, 59, 50, tzinfo=KST)
        first_run = job.trigger.get_next_fire_time(None, before_open)
        assert first_run == datetime(2026, 8, 10, 9, 0, 10, tzinfo=KST)
    finally:
        scheduler.shutdown()


def test_update_intraday_interval_reschedules_running_job(monkeypatch):
    """실행 중 스케줄러가 있으면 분봉 잡을 새 주기로 즉시 재등록해야 한다."""
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", True)
    monkeypatch.setattr(config, "INTRADAY_COLLECT_INTERVAL_MINUTES", 1)
    sched = scheduler.start()
    try:
        scheduler.update_intraday_interval(5)
        assert config.INTRADAY_COLLECT_INTERVAL_MINUTES == 5
        job = sched.get_job("intraday_collect")
        now = datetime(2026, 8, 10, 9, 1, 0, tzinfo=KST)
        next_run = job.trigger.get_next_fire_time(None, now)
        assert next_run == datetime(2026, 8, 10, 9, 5, 10, tzinfo=KST)
    finally:
        scheduler.shutdown()


def test_update_intraday_interval_without_running_scheduler_updates_config_only(monkeypatch):
    monkeypatch.setattr(config, "INTRADAY_COLLECT_INTERVAL_MINUTES", 1)
    assert scheduler._scheduler is None
    scheduler.update_intraday_interval(7)
    assert config.INTRADAY_COLLECT_INTERVAL_MINUTES == 7
