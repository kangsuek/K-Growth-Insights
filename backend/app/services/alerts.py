"""가격/신호 알림 — 추적 종목(stocks) 한정.

두 가지 판정 기준을 명확히 구분한다(CLAUDE.md '실시간 vs 확정 데이터 기준' 참고):
- 목표가(price_above/price_below): 분봉(intraday_prices, 1분 주기)의 최신 현재가로
  판정한다. 일별 시세(prices, 10분 주기)보다 갱신이 잦아 실시간 알림에 더 맞는다.
- 기술적 신호(rsi_zone/macd_cross): 일별 시세(prices)로 계산한다. 오늘자 행은
  장중엔 계속 갱신되는 미확정 값이다가 15:40 마감 수집으로 확정되므로, 트리거
  시점의 timeutil.is_close_confirmed()로 daily_live/daily_confirmed를 구분해
  기록한다.
"""
from __future__ import annotations

from datetime import datetime

from app import timeutil
from app.services import metrics, repository

# MACD(26)·RSI(14) 계산이 수렴할 만큼 여유 있는 조회 창. routers/etfs.py의
# SIGNAL_LOOKBACK_DAYS(대시보드 배치 신호 계산)와 같은 값이다 — 서비스 계층이
# 라우터를 참조하진 않으므로 값만 맞춰 별도로 둔다.
SIGNAL_LOOKBACK_DAYS = 250

_PRICE_RULE_TYPES = ("price_above", "price_below")
_SIGNAL_RULE_TYPES = ("rsi_zone", "macd_cross")


# --- 규칙 CRUD ------------------------------------------------------------

def create_rule(ticker: str, rule_type: str, target_price: float | None = None) -> dict:
    if rule_type not in _PRICE_RULE_TYPES + _SIGNAL_RULE_TYPES:
        raise ValueError(f"알 수 없는 알림 유형: {rule_type}")
    if rule_type in _PRICE_RULE_TYPES and target_price is None:
        raise ValueError(f"{rule_type}은(는) target_price가 필요합니다")
    return repository.create_alert_rule(ticker, rule_type, target_price)


def list_rules(ticker: str | None = None) -> list[dict]:
    return repository.list_alert_rules(ticker)


def update_rule(rule_id: int, **fields) -> dict | None:
    return repository.update_alert_rule(rule_id, **fields)


def delete_rule(rule_id: int) -> None:
    repository.delete_alert_rule(rule_id)


def list_events(ticker: str | None = None, unread_only: bool = False, limit: int = 50) -> list[dict]:
    return repository.list_alert_events(ticker, unread_only, limit)


def mark_events_read(event_ids: list[int]) -> None:
    repository.mark_alert_events_read(event_ids)


# --- 판정 -------------------------------------------------------------------

def check_price_rules_for_ticker(ticker: str, latest_price: float | None) -> None:
    """분봉 수집 직후 호출(1분 주기). 목표가 도달 시 1회만 기록하고 규칙을 종료한다.

    호출부(스케줄러/수동 수집/종목상세 온디맨드 수집)가 각자 조회 로직을 중복
    구현하지 않도록, 최신가 재조회까지 포함한 check_price_rules_after_intraday_collect
    를 대신 쓰는 걸 권장한다.
    """
    if latest_price is None:
        return
    rules = [
        r for r in repository.list_alert_rules(ticker)
        if r["status"] == "active" and r["rule_type"] in _PRICE_RULE_TYPES
    ]
    for rule in rules:
        target = rule.get("target_price")
        if target is None:
            continue
        hit = (
            (rule["rule_type"] == "price_above" and latest_price >= target)
            or (rule["rule_type"] == "price_below" and latest_price <= target)
        )
        if not hit:
            continue
        direction = "이상" if rule["rule_type"] == "price_above" else "이하"
        message = f"{ticker} 목표가 도달: {latest_price:,.0f}원 ({target:,.0f}원 {direction})"
        # 먼저 원자적으로 상태를 바꿔 이 스레드만 통과했는지 확인한 뒤에만 이벤트를
        # 남긴다(스케줄러·온디맨드 수집이 동시에 같은 종목을 체크할 수 있어서).
        won = repository.try_trigger_alert_rule(
            rule["id"], datetime.now(timeutil.KST).isoformat()
        )
        if won:
            repository.create_alert_event(
                rule["id"], ticker, rule["rule_type"], message, latest_price, "intraday_live"
            )


def check_signal_rules_for_ticker(ticker: str, closes_asc: list[float]) -> None:
    """일별 시세 수집 직후 호출(10분 주기). RSI 존 진입/MACD 크로스가 새로
    발생했을 때만 기록하고, 같은 거래일엔 중복 기록하지 않는다.

    알려진 트레이드오프: 규칙 단위로 하루 1회만 기록하므로, 오전에 과매도
    진입 알림을 받은 뒤 오후에 과매수로 재진입해도(혹은 골든→데드→골든처럼
    같은 날 두 번 크로스해도) 그날은 더 기록하지 않는다. dedup 없이 매 10분마다
    다시 알리면(며칠씩 같은 구간에 머무는 종목마다 계속 울려 노이즈가 훨씬 커서)
    이쪽이 낫다고 판단했다.
    """
    rules = [
        r for r in repository.list_alert_rules(ticker)
        if r["status"] == "active" and r["rule_type"] in _SIGNAL_RULE_TYPES
    ]
    if not rules:
        return

    # date.today()는 서버 로컬 타임존이라(대부분 KST로 운영되지만) 나머지 코드의
    # 명시적 KST 기준과 어긋날 수 있어 timeutil.KST로 고정한다.
    today = datetime.now(timeutil.KST).date().isoformat()
    basis = "daily_live" if not timeutil.is_close_confirmed() else "daily_confirmed"

    for rule in rules:
        last_triggered = (rule.get("last_triggered_at") or "")[:10]
        if last_triggered == today:
            continue  # 오늘 이미 기록됨

        if rule["rule_type"] == "rsi_zone":
            zone = metrics.rsi_zone_entered(closes_asc)
            if zone is None:
                continue
            label = "과매수" if zone == "overbought" else "과매도"
            message = f"{ticker} RSI {label} 구간 진입"
        else:  # macd_cross
            cross = metrics.macd_cross_signal(closes_asc)
            if cross is None:
                continue
            label = "골든크로스" if cross == "golden" else "데드크로스"
            message = f"{ticker} MACD {label} 발생"

        repository.create_alert_event(rule["id"], ticker, rule["rule_type"], message, None, basis)
        repository.update_alert_rule(rule["id"], last_triggered_at=today)


# --- 수집 직후 호출용 래퍼 -----------------------------------------------------
# 스케줄러(자동)·수동 전체 수집(jobs.py)·종목상세 온디맨드 분봉 수집(routers/etfs.py)
# 세 군데가 "수집 성공 → 최신 데이터 재조회 → 규칙 판정" 순서를 각자 중복 구현하지
# 않도록 여기 모아둔다.

def check_price_rules_after_intraday_collect(ticker: str) -> None:
    """분봉 수집 성공 직후 호출. 최신 분봉가를 재조회해 목표가 규칙을 판정한다."""
    check_price_rules_for_ticker(ticker, repository.get_latest_intraday_price(ticker))


def check_signal_rules_after_daily_collect(ticker: str) -> None:
    """일별 시세 수집 성공 직후 호출. 종가 시계열을 재조회해 신호 규칙을 판정한다."""
    closes = [
        p["close_price"] for p in repository.get_prices(ticker, days=SIGNAL_LOOKBACK_DAYS)
        if p.get("close_price") is not None
    ]
    check_signal_rules_for_ticker(ticker, closes)
