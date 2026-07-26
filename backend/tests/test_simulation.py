"""Phase 6(시뮬레이션) 테스트: 일시/적립식/포트폴리오."""
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import simulation
from tests.conftest import seed_stock

client = TestClient(app)


def _seed(ticker, closes, start_day=1, month=7):
    with get_connection() as conn:
        for i, c in enumerate(closes):
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES (?, ?, ?, ?, ?, ?, 1000, 0)""",
                (ticker, f"2026-{month:02d}-{start_day + i:02d}", c, c, c, c),
            )


def test_lump_sum_shares_and_return():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed("005930", [100, 110, 120])  # 07-01..07-03
    r = simulation.lump_sum("005930", "2026-07-01", 1000.0)
    assert r["shares"] == 10          # 1000 // 100
    assert r["buy_price"] == 100
    assert r["total_return_pct"] == 20.0  # 100→120
    assert r["max_gain"]["return_pct"] == 20.0
    assert len(r["price_series"]) == 3


def test_lump_sum_endpoint():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed("005930", [100, 105])
    r = client.post("/api/simulation/lump-sum",
                    json={"ticker": "005930", "buy_date": "2026-07-01", "amount": 1000})
    assert r.status_code == 200
    assert r.json()["shares"] == 10


def test_lump_sum_insufficient_amount_400():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed("005930", [5000])
    r = client.post("/api/simulation/lump-sum",
                    json={"ticker": "005930", "buy_date": "2026-07-01", "amount": 1000})
    assert r.status_code == 400


def test_dca_accumulates_monthly():
    seed_stock("005930", "삼성전자", "STOCK")
    # 07-01 100원, 08-01 200원
    _seed("005930", [100], start_day=1, month=7)
    _seed("005930", [200], start_day=1, month=8)
    r = simulation.dca("005930", 1000.0, "2026-07-01", "2026-08-31", buy_day=1)
    assert r["total_shares"] == 15    # 07: 10주, 08: 5주
    assert len(r["monthly_data"]) == 2
    assert r["total_invested"] == 2000.0


def test_portfolio_weights_and_series():
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    _seed("005930", [100, 110])
    _seed("000660", [200, 220])
    r = simulation.portfolio(
        [{"ticker": "005930", "weight": 0.5}, {"ticker": "000660", "weight": 0.5}],
        10000.0, "2026-07-01", "2026-07-31")
    assert len(r["holdings_result"]) == 2
    assert r["daily_series"][0]["date"] == "2026-07-01"
    # 둘 다 +10% → 포트폴리오도 약 +10%
    assert r["total_return_pct"] > 0


# --- 회귀 방지: 검수에서 발견한 계산 결함 -------------------------------------

def test_lump_sum_uses_old_buy_date_beyond_400_days():
    """400거래일보다 오래된 매수일도 그대로 쓴다.

    회귀 방지: 최근 400거래일만 읽어와 필터했기 때문에, 데이터가 있어도 오래된
    매수일이 조용히 앞당겨졌다(2020-01-02 요청 → 2024-11-29로 계산).
    """
    seed_stock("005930", "삼성전자", "STOCK")
    # 450거래일: 2024-01-01부터 하루씩(주말 무시 — 날짜만 필요)
    from datetime import date, timedelta
    d0 = date(2024, 1, 1)
    with get_connection() as conn:
        for i in range(450):
            d = (d0 + timedelta(days=i)).isoformat()
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES (?, ?, ?, ?, ?, ?, 1000, 0)""",
                (ticker_c := "005930", d, 100 + i, 100 + i, 100 + i, 100 + i),
            )
        assert ticker_c == "005930"

    result = simulation.lump_sum("005930", "2024-01-01", 1_000_000)

    assert result["buy_date"] == "2024-01-01", "오래된 매수일이 앞당겨졌다"
    assert result["buy_price"] == 100


def test_lump_sum_future_buy_date_raises():
    """미래 매수일은 조용히 마지막 거래일로 바꾸지 않고 오류로 알린다."""
    seed_stock("005930", "삼성전자", "STOCK")
    _seed("005930", [100, 110, 120])  # 2026-07-01..03

    try:
        simulation.lump_sum("005930", "2030-01-01", 1_000_000)
    except ValueError as exc:
        assert "미래" in str(exc)
    else:
        raise AssertionError("미래 매수일인데 오류가 나지 않았다")


def test_lump_sum_buy_date_after_last_price_raises():
    """과거지만 시세 범위를 넘는 매수일도 마지막 거래일로 되돌리지 않는다."""
    seed_stock("005930", "삼성전자", "STOCK")
    _seed("005930", [100, 110, 120], month=1)  # 2026-01-01..03만

    try:
        # 시세는 1월까지인데 3월 매수 → 이후 거래일이 없다
        simulation.lump_sum("005930", "2026-03-01", 1_000_000)
    except ValueError as exc:
        assert "데이터가 없습니다" in str(exc) or "거래일이 없습니다" in str(exc)
    else:
        raise AssertionError("시세 범위를 넘는 매수일인데 오류가 나지 않았다")


def test_dca_skips_months_without_prices():
    """시세가 없는 미래 월은 매수하지 않는다.

    회귀 방지: 마지막 거래일로 폴백해 8~12월이 모두 같은 날짜로 중복 매수됐다
    (07-24 × 5회, 투자금이 5개월분 과다 계상).
    """
    seed_stock("005930", "삼성전자", "STOCK")
    # 1~3월만 시세가 있다(매월 1일 근처)
    with get_connection() as conn:
        for m in (1, 2, 3):
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES (?, ?, ?, ?, ?, ?, 1000, 0)""",
                ("005930", f"2026-{m:02d}-02", 100, 100, 100, 100),
            )

    result = simulation.dca("005930", 500_000, "2026-01-01", "2026-12-31", buy_day=1)

    dates = [m["date"] for m in result["monthly_data"]]
    assert dates == ["2026-01-02", "2026-02-02", "2026-03-02"], f"예상 밖 매수일: {dates}"
    assert len(dates) == len(set(dates)), "같은 거래일에 두 번 매수했다"
    assert result["total_invested"] == 1_500_000, "미래 월까지 투자금에 넣었다"


def test_portfolio_holds_cash_before_first_trade():
    """아직 매수하지 않은 종목의 배분액은 현금으로 평가한다.

    회귀 방지: 평가액에서 아예 빠져 첫날 수익률이 -50%로 왜곡됐다.
    """
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    _seed("005930", [100, 100, 100])          # 07-01..07-03
    _seed("000660", [200], start_day=3)       # 07-03만

    result = simulation.portfolio(
        [{"ticker": "005930", "weight": 0.5}, {"ticker": "000660", "weight": 0.5}],
        1_000_000, "2026-07-01", "2026-07-03",
    )

    first = result["daily_series"][0]
    assert first["date"] == "2026-07-01"
    # 005930은 50만원어치 보유(주식+잔돈), 000660은 아직 현금 50만원 → 합 100만원
    assert first["valuation"] == 1_000_000, f"첫날 평가액이 어긋난다: {first['valuation']}"
    assert first["return_pct"] == 0.0, f"첫날 수익률이 0이 아니다: {first['return_pct']}"


def test_portfolio_reports_skipped_tickers():
    """기간에 시세가 없어 제외된 종목을 응답에 알린다."""
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    _seed("005930", [100, 100, 100])
    # 000660은 시세 없음

    result = simulation.portfolio(
        [{"ticker": "005930", "weight": 0.5}, {"ticker": "000660", "weight": 0.5}],
        1_000_000, "2026-07-01", "2026-07-03",
    )

    assert result["skipped_tickers"] == ["000660"]
    # 제외된 종목의 배분액은 투자금에서도 빠진다
    assert result["total_invested"] == 500_000


def test_portfolio_total_matches_daily_series_end():
    """총수익률과 마지막 일자 수익률이 어긋나지 않는다(반올림 재사용 제거)."""
    seed_stock("005930", "삼성전자", "STOCK")
    _seed("005930", [333, 777, 1111])

    result = simulation.portfolio(
        [{"ticker": "005930", "weight": 1.0}], 1_000_000, "2026-07-01", "2026-07-03",
    )

    assert result["total_return_pct"] == result["daily_series"][-1]["return_pct"]
