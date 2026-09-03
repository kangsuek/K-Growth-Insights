"""매수/매도 거래내역 — 평단가(가중평균)·순보유수량·실현손익 계산.

stocks.purchase_price/quantity/purchase_date는 이제 사용자가 직접 입력하지 않고, 이
모듈이 거래내역(stock_transactions)으로부터 매번 재계산해 채우는 파생 캐시다. 그래서
이 세 컬럼을 읽기만 하는 기존 화면(종목상세 매입가 카드·차트 기준선, 포트폴리오 손익
계산 등)은 전혀 손댈 필요가 없다 — 값을 채우는 주체만 바뀐다.

add/edit/remove는 각각 "쓰기 → 전체 재계산 → 검증"을 하나의 DB 커넥션(=하나의 SQLite
트랜잭션) 안에서 수행한다. 검증에 실패하면 ValueError를 그대로 던지고, get_connection()의
예외 처리가 이 트랜잭션 전체를 롤백한다 — 방금 쓴 내용이 무효한 상태로 남지 않는다.
"""
from __future__ import annotations

from app.database import get_connection
from app.services import repository

VALID_TYPES = ("BUY", "SELL")


def _walk(transactions_asc: list[dict]) -> dict:
    """시간순 거래 목록을 순회해 최종 상태를 계산한다.

    - BUY: 가중평균으로 평단가 갱신, 수량 누적.
    - SELL: 그 시점 보유수량보다 많으면 오류. 실현손익 = (매도가-그 시점 평단가)×수량,
      평단가는 매도로 변하지 않는다(남은 물량의 원가는 그대로).

    반환: {"error": str|None, "qty": int, "avg_cost": float|None,
           "first_date": str|None, "realized_by_id": {id: float}}
    """
    qty = 0
    avg_cost = 0.0
    realized_by_id: dict[int, float] = {}
    first_date = transactions_asc[0]["transaction_date"] if transactions_asc else None
    for t in transactions_asc:
        if t["transaction_type"] == "BUY":
            new_qty = qty + t["quantity"]
            avg_cost = (qty * avg_cost + t["quantity"] * t["price"]) / new_qty
            qty = new_qty
        else:  # SELL
            if t["quantity"] > qty:
                return {
                    "error": (
                        f"{t['transaction_date']} 매도 수량({t['quantity']:,}주)이 "
                        f"그 시점 보유 수량({qty:,}주)을 초과합니다"
                    )
                }
            realized_by_id[t["id"]] = round((t["price"] - avg_cost) * t["quantity"])
            qty -= t["quantity"]
    return {
        "error": None,
        "qty": qty,
        "avg_cost": avg_cost if qty > 0 else None,
        "first_date": first_date,
        "realized_by_id": realized_by_id,
    }


def _validate_type(transaction_type: str) -> None:
    if transaction_type not in VALID_TYPES:
        raise ValueError(f"알 수 없는 거래 유형: {transaction_type}")


def _validate_values(price: float, quantity: int) -> None:
    if price is None or price <= 0:
        raise ValueError("가격은 0보다 커야 합니다")
    if quantity is None or quantity <= 0:
        raise ValueError("수량은 0보다 커야 합니다")


def _recompute_and_apply(conn, ticker: str) -> dict:
    """conn 안에서 방금 쓴 내용을 포함해 전체를 재계산하고, 유효하면 즉시 반영한다.

    오류면 ValueError를 던진다 — 호출부(add/edit/remove)의 get_connection() 블록이
    이를 잡아 트랜잭션 전체(방금 쓴 insert/update/delete 포함)를 롤백한다.
    """
    ordered = repository.list_transactions(conn, ticker)  # 이미 날짜,id 오름차순
    result = _walk(ordered)
    if result["error"]:
        raise ValueError(result["error"])
    for txn_id, pnl in result["realized_by_id"].items():
        repository.update_transaction(conn, txn_id, realized_pnl=pnl)
    repository.update_stock_position(
        conn, ticker,
        purchase_price=round(result["avg_cost"]) if result["avg_cost"] is not None else None,
        quantity=result["qty"] if result["qty"] > 0 else None,
        purchase_date=result["first_date"],
    )
    return result


def list_for_ticker(ticker: str) -> list[dict]:
    """화면 표시용 거래내역(최신순)."""
    with get_connection() as conn:
        rows = repository.list_transactions(conn, ticker)
    return sorted(rows, key=lambda t: (t["transaction_date"], t["id"]), reverse=True)


def add(
    ticker: str, transaction_type: str, transaction_date: str,
    price: float, quantity: int, note: str | None = None,
) -> dict:
    _validate_type(transaction_type)
    _validate_values(price, quantity)
    with get_connection() as conn:
        created = repository.create_transaction(
            conn, ticker, transaction_type, transaction_date, price, quantity, note
        )
        _recompute_and_apply(conn, ticker)
        return repository.get_transaction(conn, created["id"])


def edit(transaction_id: int, **fields) -> dict | None:
    with get_connection() as conn:
        existing = repository.get_transaction(conn, transaction_id)
        if existing is None:
            return None
        if "transaction_type" in fields:
            _validate_type(fields["transaction_type"])
        merged = {**existing, **fields}
        _validate_values(merged["price"], merged["quantity"])

        repository.update_transaction(conn, transaction_id, **fields)
        _recompute_and_apply(conn, existing["ticker"])
        return repository.get_transaction(conn, transaction_id)


def remove(transaction_id: int) -> None:
    with get_connection() as conn:
        existing = repository.get_transaction(conn, transaction_id)
        if existing is None:
            return
        repository.delete_transaction(conn, transaction_id)
        try:
            _recompute_and_apply(conn, existing["ticker"])
        except ValueError:
            raise ValueError(
                "이 거래를 삭제하면 이후 매도 내역이 보유 수량을 초과하게 됩니다. "
                "관련 매도 내역을 먼저 정리해주세요."
            ) from None
