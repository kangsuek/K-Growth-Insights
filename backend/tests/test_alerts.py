"""Phase 8(알림) 테스트: 규칙 CRUD·트리거 기록."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create(ticker="005930", target=300000):
    return client.post("/api/alerts/", json={
        "ticker": ticker, "alert_type": "buy", "direction": "below",
        "target_price": target, "memo": "저가 매수",
    }).json()


def test_create_and_get_rules():
    r = _create()
    assert r["id"] > 0 and r["ticker"] == "005930"
    assert r["is_active"] == 1
    rules = client.get("/api/alerts/005930").json()
    assert len(rules) == 1
    assert rules[0]["memo"] == "저가 매수"


def test_update_rule():
    rule = _create()
    r = client.put(f"/api/alerts/{rule['id']}", json={"target_price": 250000, "is_active": 0})
    assert r.status_code == 200
    assert r.json()["target_price"] == 250000
    assert r.json()["is_active"] == 0
    # active_only=True면 제외
    assert client.get("/api/alerts/005930", params={"active_only": "true"}).json() == []
    # active_only=False면 포함
    assert len(client.get("/api/alerts/005930", params={"active_only": "false"}).json()) == 1


def test_update_missing_404():
    assert client.put("/api/alerts/9999", json={"memo": "x"}).status_code == 404


def test_delete_rule():
    rule = _create()
    r = client.delete(f"/api/alerts/{rule['id']}")
    assert r.status_code == 200
    assert client.delete(f"/api/alerts/{rule['id']}").status_code == 404


def test_record_trigger_and_history():
    rule = _create()
    r = client.post("/api/alerts/trigger", json={
        "rule_id": rule["id"], "ticker": "005930",
        "alert_type": "buy", "message": "목표가 도달",
    })
    assert r.json()["recorded"] is True
    hist = client.get("/api/alerts/history/005930").json()
    assert len(hist) == 1 and hist[0]["message"] == "목표가 도달"
