"""가격 알림 규칙 CRUD + 트리거 기록. 원본 /alerts 계약 재현."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.database import get_connection

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

_RULE_COLS = ("id, ticker, alert_type, direction, target_price, memo, "
              "is_active, created_at, last_triggered_at")


class AlertRuleCreate(BaseModel):
    ticker: str
    alert_type: str
    direction: str
    target_price: float
    memo: Optional[str] = None


class AlertRuleUpdate(BaseModel):
    alert_type: Optional[str] = None
    direction: Optional[str] = None
    target_price: Optional[float] = None
    memo: Optional[str] = None
    is_active: Optional[int] = None


class AlertTriggerRequest(BaseModel):
    rule_id: Optional[int] = None
    ticker: str
    alert_type: Optional[str] = None
    message: Optional[str] = None


def _rule(row) -> dict:
    return dict(row)


@router.post("/trigger")
def record_trigger(req: AlertTriggerRequest):
    """알림 트리거 기록(fire-and-forget). 규칙의 last_triggered_at 갱신."""
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO alert_history (rule_id, ticker, alert_type, message) VALUES (?, ?, ?, ?)",
            (req.rule_id, req.ticker, req.alert_type, req.message),
        )
        if req.rule_id is not None:
            conn.execute(
                "UPDATE alert_rules SET last_triggered_at=datetime('now') WHERE id=?",
                (req.rule_id,),
            )
    return {"recorded": True}


@router.get("/history/{ticker}")
def get_history(ticker: str, limit: int = Query(50, ge=1, le=200)):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, rule_id, ticker, alert_type, message, triggered_at "
            "FROM alert_history WHERE ticker=? ORDER BY triggered_at DESC LIMIT ?",
            (ticker, limit),
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/")
def create_rule(rule: AlertRuleCreate):
    with get_connection() as conn:
        cur = conn.execute(
            """INSERT INTO alert_rules (ticker, alert_type, direction, target_price, memo)
               VALUES (?, ?, ?, ?, ?)""",
            (rule.ticker, rule.alert_type, rule.direction, rule.target_price, rule.memo),
        )
        row = conn.execute(f"SELECT {_RULE_COLS} FROM alert_rules WHERE id=?",
                           (cur.lastrowid,)).fetchone()
    return _rule(row)


@router.get("/{ticker}")
def get_rules(ticker: str, active_only: bool = Query(True)):
    sql = f"SELECT {_RULE_COLS} FROM alert_rules WHERE ticker=?"
    params: list = [ticker]
    if active_only:
        sql += " AND is_active=1"
    sql += " ORDER BY created_at DESC"
    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_rule(r) for r in rows]


@router.put("/{rule_id}")
def update_rule(rule_id: int, update: AlertRuleUpdate):
    data = update.model_dump(exclude_unset=True)
    with get_connection() as conn:
        if not conn.execute("SELECT 1 FROM alert_rules WHERE id=?", (rule_id,)).fetchone():
            raise HTTPException(status_code=404, detail="알림 규칙을 찾을 수 없습니다")
        if data:
            sets = ", ".join(f"{k}=?" for k in data)
            conn.execute(f"UPDATE alert_rules SET {sets} WHERE id=?", (*data.values(), rule_id))
        row = conn.execute(f"SELECT {_RULE_COLS} FROM alert_rules WHERE id=?", (rule_id,)).fetchone()
    return _rule(row)


@router.delete("/{rule_id}")
def delete_rule(rule_id: int):
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM alert_rules WHERE id=?", (rule_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="알림 규칙을 찾을 수 없습니다")
    return {"deleted": True, "id": rule_id}
