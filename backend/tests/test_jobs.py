"""작업 6: 전체 수집 백그라운드 진행률(jobs) 테스트."""
import time

from fastapi.testclient import TestClient

from app.main import app
from app.services import jobs
from tests.conftest import seed_stock

client = TestClient(app)


class _R:
    def __init__(self, ok=True):
        self.ok = ok


def _reset_state():
    with jobs._lock:
        jobs._state.update(status="idle", total=0, completed=0, succeeded=0,
                           failed=0, current=None, started_at=None, finished_at=None)


def _wait_done(timeout=3.0):
    start = time.time()
    while time.time() - start < timeout:
        if jobs.snapshot()["status"] in ("done", "error"):
            return
        time.sleep(0.02)


def test_run_tracks_progress_and_counts(monkeypatch):
    _reset_state()
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    monkeypatch.setattr(jobs.collectors, "collect_stock",
                        lambda t: _R(ok=(t != "000660")))
    jobs._run([{"ticker": "005930"}, {"ticker": "000660"}])
    snap = jobs.snapshot()
    assert snap["status"] == "done"
    assert snap["total"] == 2 or snap["completed"] == 2
    assert snap["completed"] == 2
    assert snap["succeeded"] == 1
    assert snap["failed"] == 1
    assert snap["finished_at"] is not None


def test_run_sets_error_status_on_exception(monkeypatch):
    _reset_state()
    def boom(_):
        raise RuntimeError("네트워크 오류")
    monkeypatch.setattr(jobs.collectors, "collect_stock", boom)
    jobs._run([{"ticker": "005930"}])
    assert jobs.snapshot()["status"] == "error"


def test_start_is_single_flight(monkeypatch):
    _reset_state()
    seed_stock("005930", "삼성전자", "STOCK")

    def slow(_):
        time.sleep(0.1)
        return _R(True)

    monkeypatch.setattr(jobs.collectors, "collect_stock", slow)
    assert jobs.start() is True     # 첫 시작
    assert jobs.start() is False    # 실행 중 재시작 거부
    _wait_done()
    assert jobs.snapshot()["status"] == "done"


def test_collect_all_endpoint_starts_and_status_polls(monkeypatch):
    _reset_state()
    seed_stock("005930", "삼성전자", "STOCK")
    monkeypatch.setattr(jobs.collectors, "collect_stock", lambda t: _R(True))
    r = client.post("/api/data/collect-all")
    assert r.status_code == 200
    body = r.json()
    assert body["started"] is True
    assert "total" in body and "completed" in body
    _wait_done()
    status = client.get("/api/data/collect-status").json()
    assert status["status"] == "done"
    assert status["succeeded"] == 1
