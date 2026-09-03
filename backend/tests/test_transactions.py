"""매수/매도 거래내역: 평단가(가중평균)·순보유수량·실현손익 계산 및 검증."""
from fastapi.testclient import TestClient

from app import database
from app.main import app
from tests.conftest import seed_stock

client = TestClient(app)


def _buy(ticker, date, price, quantity, note=None):
    return client.post(f"/api/settings/stocks/{ticker}/transactions", json={
        "transaction_type": "BUY", "transaction_date": date,
        "price": price, "quantity": quantity, "note": note,
    })


def _sell(ticker, date, price, quantity):
    return client.post(f"/api/settings/stocks/{ticker}/transactions", json={
        "transaction_type": "SELL", "transaction_date": date,
        "price": price, "quantity": quantity,
    })


def test_single_buy_sets_stock_position():
    seed_stock("005930", "삼성전자", "STOCK")
    r = _buy("005930", "2026-01-10", 70000, 10)
    assert r.status_code == 201

    stock = client.get("/api/etfs/005930").json()
    assert stock["purchase_price"] == 70000
    assert stock["quantity"] == 10
    assert stock["purchase_date"] == "2026-01-10"


def test_two_buys_average_cost_is_weighted():
    seed_stock("005930", "삼성전자", "STOCK")
    _buy("005930", "2026-01-10", 70000, 10)   # 700,000원
    _buy("005930", "2026-02-10", 80000, 10)   # 800,000원
    # 평단가 = 1,500,000 / 20 = 75,000
    stock = client.get("/api/etfs/005930").json()
    assert stock["purchase_price"] == 75000
    assert stock["quantity"] == 20
    assert stock["purchase_date"] == "2026-01-10"  # 최초 거래일 유지


def test_sell_reduces_quantity_but_not_avg_cost():
    seed_stock("005930", "삼성전자", "STOCK")
    _buy("005930", "2026-01-10", 70000, 10)
    _buy("005930", "2026-02-10", 80000, 10)  # 평단가 75,000, 수량 20
    r = _sell("005930", "2026-03-10", 90000, 5)
    assert r.status_code == 201

    stock = client.get("/api/etfs/005930").json()
    assert stock["purchase_price"] == 75000  # 매도는 평단가를 바꾸지 않는다
    assert stock["quantity"] == 15


def test_sell_records_realized_pnl():
    seed_stock("005930", "삼성전자", "STOCK")
    _buy("005930", "2026-01-10", 70000, 10)
    r = _sell("005930", "2026-02-10", 90000, 4)
    assert r.status_code == 201
    txn = r.json()
    # (90000-70000)*4 = 80000
    assert txn["realized_pnl"] == 80000


def test_full_sell_clears_position_but_keeps_first_date():
    seed_stock("005930", "삼성전자", "STOCK")
    _buy("005930", "2026-01-10", 70000, 10)
    _sell("005930", "2026-02-10", 90000, 10)

    stock = client.get("/api/etfs/005930").json()
    assert stock["purchase_price"] is None
    assert stock["quantity"] is None
    assert stock["purchase_date"] == "2026-01-10"


def test_oversell_rejected_with_400():
    seed_stock("005930", "삼성전자", "STOCK")
    _buy("005930", "2026-01-10", 70000, 10)
    r = _sell("005930", "2026-02-10", 90000, 11)
    assert r.status_code == 400

    # 실패한 매도는 반영되지 않아야 한다(보유 수량 그대로).
    stock = client.get("/api/etfs/005930").json()
    assert stock["quantity"] == 10


def test_editing_buy_that_invalidates_later_sell_is_rejected():
    seed_stock("005930", "삼성전자", "STOCK")
    buy = _buy("005930", "2026-01-10", 70000, 10).json()
    _sell("005930", "2026-02-10", 90000, 8)

    # 최초 매수 수량을 8보다 적게 줄이면 이후 매도가 보유량을 초과하게 된다.
    r = client.put(f"/api/settings/stocks/transactions/{buy['id']}", json={"quantity": 5})
    assert r.status_code == 400

    # 거부됐으므로 원래 수량이 그대로 유지된다.
    stock = client.get("/api/etfs/005930").json()
    assert stock["quantity"] == 2  # 10 - 8


def test_deleting_buy_that_invalidates_later_sell_is_rejected():
    seed_stock("005930", "삼성전자", "STOCK")
    buy = _buy("005930", "2026-01-10", 70000, 10).json()
    _sell("005930", "2026-02-10", 90000, 8)

    r = client.delete(f"/api/settings/stocks/transactions/{buy['id']}")
    assert r.status_code == 400

    txns = client.get("/api/settings/stocks/005930/transactions").json()
    assert len(txns) == 2  # 삭제되지 않았다


def test_delete_transaction_recomputes_position():
    seed_stock("005930", "삼성전자", "STOCK")
    buy = _buy("005930", "2026-01-10", 70000, 10).json()
    _buy("005930", "2026-02-10", 80000, 10)

    r = client.delete(f"/api/settings/stocks/transactions/{buy['id']}")
    assert r.status_code == 204

    stock = client.get("/api/etfs/005930").json()
    assert stock["purchase_price"] == 80000
    assert stock["quantity"] == 10
    assert stock["purchase_date"] == "2026-02-10"


def test_list_transactions_desc_order():
    seed_stock("005930", "삼성전자", "STOCK")
    _buy("005930", "2026-01-10", 70000, 10)
    _buy("005930", "2026-02-10", 80000, 10)

    txns = client.get("/api/settings/stocks/005930/transactions").json()
    assert [t["transaction_date"] for t in txns] == ["2026-02-10", "2026-01-10"]


def test_transaction_endpoints_404_for_unknown_ticker():
    assert client.get("/api/settings/stocks/999999/transactions").status_code == 404
    r = client.post("/api/settings/stocks/999999/transactions", json={
        "transaction_type": "BUY", "transaction_date": "2026-01-01",
        "price": 1000, "quantity": 1,
    })
    assert r.status_code == 404


def test_sell_as_first_transaction_rejected():
    seed_stock("005930", "삼성전자", "STOCK")
    r = _sell("005930", "2026-01-10", 90000, 1)
    assert r.status_code == 400
    assert client.get("/api/settings/stocks/005930/transactions").json() == []


def test_editing_sell_recomputes_realized_pnl():
    seed_stock("005930", "삼성전자", "STOCK")
    _buy("005930", "2026-01-10", 70000, 10)
    sell = _sell("005930", "2026-02-10", 90000, 4).json()
    assert sell["realized_pnl"] == 80000  # (90000-70000)*4

    r = client.put(f"/api/settings/stocks/transactions/{sell['id']}", json={"price": 100000})
    assert r.status_code == 200
    assert r.json()["realized_pnl"] == 120000  # (100000-70000)*4


def test_invalid_transaction_type_rejected():
    seed_stock("005930", "삼성전자", "STOCK")
    r = client.post("/api/settings/stocks/005930/transactions", json={
        "transaction_type": "HOLD", "transaction_date": "2026-01-01",
        "price": 1000, "quantity": 1,
    })
    assert r.status_code == 400


def test_legacy_purchase_data_migrated_to_transaction(tmp_path, monkeypatch):
    """구버전 DB의 stocks.purchase_price/quantity가 최초 매수 거래로 자동 이전된다."""
    seed_stock("005930", "삼성전자", "STOCK")
    with database.get_connection() as conn:
        conn.execute(
            "UPDATE stocks SET purchase_date=?, purchase_price=?, quantity=? WHERE ticker=?",
            ("2026-01-05", 65000, 3, "005930"),
        )

    database.init_db()  # 레거시 이전 로직 재실행(멱등성 확인 겸)

    txns = client.get("/api/settings/stocks/005930/transactions").json()
    assert len(txns) == 1
    assert txns[0]["transaction_type"] == "BUY"
    assert txns[0]["transaction_date"] == "2026-01-05"
    assert txns[0]["price"] == 65000
    assert txns[0]["quantity"] == 3

    # 재실행해도 중복 이전되지 않는다.
    database.init_db()
    txns_again = client.get("/api/settings/stocks/005930/transactions").json()
    assert len(txns_again) == 1


def test_deleting_stock_cascades_to_transactions():
    """종목 삭제 시 거래내역도 함께 삭제돼야 한다(고아 데이터 방지)."""
    seed_stock("005930", "삼성전자", "STOCK")
    _buy("005930", "2026-01-10", 70000, 10)

    r = client.delete("/api/settings/stocks/005930")
    assert r.status_code == 200
    assert r.json()["deleted"]["stock_transactions"] == 1

    with database.get_connection() as conn:
        remaining = conn.execute(
            "SELECT COUNT(*) AS c FROM stock_transactions WHERE ticker = ?", ("005930",)
        ).fetchone()["c"]
    assert remaining == 0


def test_legacy_purchase_data_migration_falls_back_to_today_when_date_missing():
    """구버전 데이터에 구매일이 없으면(purchase_date NULL) 오늘 날짜로 이전한다."""
    from datetime import date

    seed_stock("000660", "SK하이닉스", "STOCK")
    with database.get_connection() as conn:
        conn.execute(
            "UPDATE stocks SET purchase_price=?, quantity=? WHERE ticker=?",
            (50000, 2, "000660"),
        )

    database.init_db()

    txns = client.get("/api/settings/stocks/000660/transactions").json()
    assert len(txns) == 1
    assert txns[0]["transaction_date"] == date.today().isoformat()
