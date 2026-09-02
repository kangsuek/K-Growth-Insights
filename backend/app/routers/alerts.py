"""가격/신호 알림 계약: 규칙 CRUD + 발생 이력 조회."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import alerts, repository

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class RuleCreate(BaseModel):
    ticker: str
    rule_type: str  # price_above | price_below | rsi_zone | macd_cross
    target_price: Optional[float] = None


class RuleUpdate(BaseModel):
    status: Optional[str] = None
    target_price: Optional[float] = None


class EventsReadRequest(BaseModel):
    event_ids: list[int]


@router.get("/rules")
def get_rules(ticker: Optional[str] = None):
    return alerts.list_rules(ticker)


@router.post("/rules", status_code=201)
def create_rule(rule: RuleCreate):
    try:
        return alerts.create_rule(rule.ticker, rule.rule_type, rule.target_price)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/rules/{rule_id}")
def update_rule(rule_id: int, rule: RuleUpdate):
    fields = {k: v for k, v in rule.model_dump().items() if v is not None}
    updated = alerts.update_rule(rule_id, **fields)
    if not updated:
        raise HTTPException(status_code=404, detail="규칙을 찾을 수 없습니다")
    return updated


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int):
    alerts.delete_rule(rule_id)


@router.get("/events")
def get_events(ticker: Optional[str] = None, unread_only: bool = False, limit: int = 50):
    return alerts.list_events(ticker, unread_only, limit)


@router.get("/events/unread-count")
def get_unread_count():
    return {"count": repository.count_unread_alert_events()}


@router.post("/events/read")
def mark_events_read(body: EventsReadRequest):
    alerts.mark_events_read(body.event_ids)
    return {"message": "읽음 처리되었습니다"}
