"""가격/신호 알림 테스트: 규칙 CRUD + 판정 로직 + 라우터 계약."""
from fastapi.testclient import TestClient

from app.main import app
from app.services import alerts, metrics, repository
from tests.conftest import seed_stock

client = TestClient(app)


def _first_golden_cross_index(closes: list[float]) -> int:
    """MACD-시그널 부호가 처음 상향 반전되는 인덱스(test_metrics.py와 동일 로직).

    macd_cross_signal은 '마지막 날'만 보므로, 교차가 일어난 그날까지만 잘라
    넘겨야 'golden'이 나온다 — 교차 이후 며칠 지난 시계열을 통째로 넘기면
    이미 지난 상태라 None이 된다.
    """
    macd_line, signal_line = metrics.calculate_macd(closes)
    idx = [i for i in range(len(macd_line))
           if macd_line[i] is not None and signal_line[i] is not None]
    for a, b in zip(idx, idx[1:]):
        if macd_line[a] <= signal_line[a] and macd_line[b] > signal_line[b]:
            return b
    raise AssertionError("테스트 데이터에서 골든크로스가 발생해야 한다")


# --- 규칙 CRUD ----------------------------------------------------------------

def test_create_and_list_rule():
    seed_stock("005930", "삼성전자", "STOCK")
    rule = alerts.create_rule("005930", "price_above", target_price=80000)
    assert rule["ticker"] == "005930"
    assert rule["status"] == "active"

    rules = alerts.list_rules("005930")
    assert len(rules) == 1
    assert rules[0]["id"] == rule["id"]


def test_create_price_rule_requires_target_price():
    seed_stock("005930", "삼성전자", "STOCK")
    try:
        alerts.create_rule("005930", "price_above")
        assert False, "target_price 없이 생성되면 안 된다"
    except ValueError:
        pass


def test_update_and_delete_rule():
    seed_stock("005930", "삼성전자", "STOCK")
    rule = alerts.create_rule("005930", "price_above", target_price=80000)

    updated = alerts.update_rule(rule["id"], status="disabled")
    assert updated["status"] == "disabled"

    alerts.delete_rule(rule["id"])
    assert alerts.list_rules("005930") == []


# --- 목표가 판정 ---------------------------------------------------------------

def test_check_price_rules_triggers_once_and_stops():
    """목표가 도달 시 1건만 기록하고 규칙을 'triggered'로 바꿔 재알림하지 않는다."""
    seed_stock("005930", "삼성전자", "STOCK")
    rule = alerts.create_rule("005930", "price_above", target_price=80000)

    alerts.check_price_rules_for_ticker("005930", 81000)
    events = repository.list_alert_events("005930")
    assert len(events) == 1
    assert events[0]["basis"] == "intraday_live"
    assert repository.get_alert_rule(rule["id"])["status"] == "triggered"

    # 다음 분봉 틱에서 더 높은 가격이 와도 이미 triggered라 재기록되지 않는다.
    alerts.check_price_rules_for_ticker("005930", 82000)
    assert len(repository.list_alert_events("005930")) == 1


def test_try_trigger_alert_rule_is_atomic_compare_and_swap():
    """스케줄러·온디맨드 수집이 동시에 같은 규칙을 체크해도 한쪽만 이겨야 한다
    (TOCTOU로 중복 알림이 생기는 걸 막는 조건부 UPDATE)."""
    seed_stock("005930", "삼성전자", "STOCK")
    rule = alerts.create_rule("005930", "price_above", target_price=80000)

    assert repository.try_trigger_alert_rule(rule["id"], "2026-09-02T10:00:00+09:00") is True
    # 이미 triggered이므로 두 번째 시도는 진다.
    assert repository.try_trigger_alert_rule(rule["id"], "2026-09-02T10:00:01+09:00") is False


def test_check_price_rules_below_direction():
    seed_stock("005930", "삼성전자", "STOCK")
    alerts.create_rule("005930", "price_below", target_price=70000)

    alerts.check_price_rules_for_ticker("005930", 71000)
    assert repository.list_alert_events("005930") == []  # 아직 도달 전

    alerts.check_price_rules_for_ticker("005930", 69000)
    assert len(repository.list_alert_events("005930")) == 1


# --- 신호 판정 -----------------------------------------------------------------

def test_check_signal_rules_rsi_oversold():
    """metrics.rsi_zone_entered를 그대로 재사용 — 급락으로 RSI가 30을 새로
    하향 돌파하는 시퀀스(test_metrics.py와 동일 구성)."""
    seed_stock("005930", "삼성전자", "STOCK")
    alerts.create_rule("005930", "rsi_zone")

    closes = [100.0]
    for i in range(20):
        closes.append(closes[-1] + (1 if i % 2 == 0 else -1))
    closes.append(closes[-1] * 0.5)  # 마지막 날 급락 → RSI 과매도 신규 진입

    alerts.check_signal_rules_for_ticker("005930", closes)
    events = repository.list_alert_events("005930")
    assert len(events) == 1
    assert "과매도" in events[0]["message"]

    # 같은 거래일에 다시 체크해도 중복 기록되지 않는다.
    alerts.check_signal_rules_for_ticker("005930", closes)
    assert len(repository.list_alert_events("005930")) == 1


def test_check_signal_rules_macd_golden_cross():
    """장기 하락 후 급반등으로 MACD가 시그널선을 상향 돌파(test_metrics.py와 동일 구성)."""
    seed_stock("005930", "삼성전자", "STOCK")
    alerts.create_rule("005930", "macd_cross")

    closes = [100.0 - i * 0.5 for i in range(40)]
    closes += [closes[-1] + i * 5.0 for i in range(1, 26)]
    cross_i = _first_golden_cross_index(closes)

    alerts.check_signal_rules_for_ticker("005930", closes[: cross_i + 1])
    events = repository.list_alert_events("005930")
    assert len(events) == 1
    assert "골든크로스" in events[0]["message"]


def test_check_signal_rules_no_event_when_no_new_signal():
    """변동 없는 종가라 신호가 발생하지 않으면 이벤트도 없다."""
    seed_stock("005930", "삼성전자", "STOCK")
    alerts.create_rule("005930", "rsi_zone")
    alerts.check_signal_rules_for_ticker("005930", [100.0] * 30)
    assert repository.list_alert_events("005930") == []


# --- 라우터 계약 ---------------------------------------------------------------

def test_alerts_rules_endpoint_crud():
    seed_stock("005930", "삼성전자", "STOCK")
    r = client.post("/api/alerts/rules", json={
        "ticker": "005930", "rule_type": "price_above", "target_price": 80000,
    })
    assert r.status_code == 201
    rule_id = r.json()["id"]

    r = client.get("/api/alerts/rules", params={"ticker": "005930"})
    assert r.status_code == 200 and len(r.json()) == 1

    r = client.put(f"/api/alerts/rules/{rule_id}", json={"status": "disabled"})
    assert r.status_code == 200 and r.json()["status"] == "disabled"

    r = client.delete(f"/api/alerts/rules/{rule_id}")
    assert r.status_code == 204


def test_alerts_events_endpoint_and_unread_count():
    seed_stock("005930", "삼성전자", "STOCK")
    rule = alerts.create_rule("005930", "price_above", target_price=80000)
    alerts.check_price_rules_for_ticker("005930", 81000)

    r = client.get("/api/alerts/events/unread-count")
    assert r.status_code == 200 and r.json()["count"] == 1

    events = client.get("/api/alerts/events").json()
    event_id = events[0]["id"]
    r = client.post("/api/alerts/events/read", json={"event_ids": [event_id]})
    assert r.status_code == 200

    r = client.get("/api/alerts/events/unread-count")
    assert r.json()["count"] == 0
