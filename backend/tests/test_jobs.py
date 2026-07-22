"""작업 6/이식: 전체 수집(collect_all_sync) 집계·진행률·엔드포인트 테스트."""
from fastapi.testclient import TestClient

from app.main import app
from app.models import CollectResult
from app.services import jobs
from tests.conftest import seed_stock

client = TestClient(app)


def _reset_state():
    with jobs._lock:
        jobs._state.update(status="idle", total=0, completed=0, succeeded=0,
                           failed=0, current=None, started_at=None, finished_at=None)


def test_collect_all_sync_aggregates(monkeypatch):
    _reset_state()
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")

    def fake(ticker, days=None):
        return CollectResult(ticker=ticker, prices=60, trading_flow=20, news=5,
                             fundamentals=1, ok=True)

    monkeypatch.setattr(jobs.collectors, "collect_stock", fake)
    result = jobs.collect_all_sync()
    assert result["total_tickers"] == 2
    assert result["success_count"] == 2 and result["fail_count"] == 0
    assert result["total_price_records"] == 120
    assert result["total_trading_flow_records"] == 40
    assert result["total_news_records"] == 10
    assert result["fundamentals_success"] == 2
    assert result["fundamentals_failed"] == 0
    assert "details" in result and "005930" in result["details"]
    assert jobs.snapshot()["status"] == "done"


def test_collect_all_sync_counts_fundamentals_failed(monkeypatch):
    _reset_state()
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    monkeypatch.setattr(jobs.collectors, "collect_stock",
                        lambda t, days=None: CollectResult(ticker=t, fundamentals=(1 if t == "005930" else 0), ok=True))
    result = jobs.collect_all_sync()
    assert result["fundamentals_success"] == 1
    assert result["fundamentals_failed"] == 1


def test_collect_all_endpoint_returns_result(monkeypatch):
    _reset_state()
    seed_stock("005930", "삼성전자", "STOCK")
    monkeypatch.setattr(jobs.collectors, "collect_stock",
                        lambda t, days=None: CollectResult(ticker=t, prices=60, ok=True))
    body = client.post("/api/data/collect-all").json()
    assert "message" in body and "result" in body
    assert body["result"]["total_tickers"] == 1
    assert body["result"]["total_price_records"] == 60


def test_collect_progress_status_mapping():
    _reset_state()
    body = client.get("/api/data/collect-progress").json()
    assert body["status"] == "idle"
    assert body["is_collecting"] is False
    with jobs._lock:
        jobs._state.update(status="done", total=10, completed=10)
    body = client.get("/api/data/collect-progress").json()
    assert body["status"] == "completed"  # done → completed 매핑


def test_stats_has_frontend_fields():
    seed_stock("005930", "삼성전자", "STOCK")
    body = client.get("/api/data/stats").json()
    for field in ("etfs", "stock_catalog", "last_collection", "database_size_mb"):
        assert field in body
    assert body["etfs"] == 1
