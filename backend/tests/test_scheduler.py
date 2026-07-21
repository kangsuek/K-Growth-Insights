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
        assert job_ids == {"interval_collect", "daily_close_collect"}
    finally:
        scheduler.shutdown()
    assert scheduler._scheduler is None
