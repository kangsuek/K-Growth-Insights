"""Phase 5(비교) 테스트: 정규화 가격·통계·상관관계."""
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import comparison
from tests.conftest import seed_stock

client = TestClient(app)


def _insert_prices(conn, ticker, rows):
    """(날짜, 종가) 목록을 prices에 넣는다."""
    for day, close in rows:
        conn.execute(
            """INSERT INTO prices (ticker, date, open_price, high_price,
               low_price, close_price, volume, change_pct)
               VALUES (?, ?, ?, ?, ?, ?, 1000, 0)""",
            (ticker, day, close, close, close, close),
        )


def _seed_prices(ticker, closes, start_day=1):
    """2026년 7월 고정 날짜로 시드. 조회 구간을 명시하는 테스트용."""
    with get_connection() as conn:
        _insert_prices(conn, ticker, [
            (f"2026-07-{start_day + i:02d}", c) for i, c in enumerate(closes)
        ])


def _seed_recent_prices(ticker, closes):
    """오늘부터 거슬러 올라가며 시드(closes는 오래된→최신).

    조회 구간을 생략하면 기본이 '최근 30일'이라, 고정 날짜로 시드하면 그 구간을
    벗어나는 날부터 테스트가 깨진다. 오늘 기준으로 넣어 날짜와 무관하게 만든다.
    """
    today = date.today()
    with get_connection() as conn:
        _insert_prices(conn, ticker, [
            ((today - timedelta(days=i)).isoformat(), c)
            for i, c in enumerate(reversed(closes))
        ])


def test_compare_normalizes_and_stats():
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    _seed_prices("005930", [100, 110, 120])
    _seed_prices("000660", [200, 210, 220])
    body = comparison.compare(["005930", "000660"], "2026-07-01", "2026-07-31")
    # 정규화: 시작 100
    assert body["normalized_prices"]["data"]["005930"][0] == 100.0
    assert body["normalized_prices"]["data"]["005930"][-1] == 120.0  # 100→120
    # 통계 period_return
    assert body["statistics"]["005930"]["period_return"] == 20.0
    # 상관관계 대각선 1.0
    idx = body["correlation_matrix"]["tickers"].index("005930")
    assert body["correlation_matrix"]["matrix"][idx][idx] == 1.0


def test_compare_uses_full_calendar_range_beyond_400_rows():
    """get_prices(days=400)는 최근 400개 행(거래일)만 반환해 긴 보유 이력에서
    요청한 시작일이 조용히 잘렸다(52주 최저가 버그와 동일 패턴) — 캘린더 범위
    전체(get_prices_range)가 나와야 한다."""
    seed_stock("005930", "삼성전자", "STOCK")
    closes = list(range(100, 520))  # 420일치(400행 제한보다 많음)
    _seed_recent_prices("005930", closes)
    start = (date.today() - timedelta(days=419)).isoformat()
    end = date.today().isoformat()

    body = comparison.compare(["005930"], start, end)

    assert body["normalized_prices"]["dates"][0] == start
    assert len(body["normalized_prices"]["dates"]) == 420


def test_compare_endpoint_requires_two():
    seed_stock("005930", "삼성전자", "STOCK")
    r = client.get("/api/etfs/compare", params={"tickers": "005930"})
    assert r.status_code == 400


def test_compare_endpoint_shape():
    """조회 구간을 생략하면 기본 구간(최근 30일)으로 계산한다."""
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    _seed_recent_prices("005930", [100, 101, 102])
    _seed_recent_prices("000660", [200, 202, 204])
    body = client.get("/api/etfs/compare", params={"tickers": "005930,000660"}).json()
    assert "normalized_prices" in body and "statistics" in body
    assert "correlation_matrix" in body
    assert set(body["statistics"]) == {"005930", "000660"}
    assert body["statistics"]["005930"]["period_return"] == 2.0  # 100 → 102


def test_annualized_is_none_for_short_period():
    """3개월 미만 표본이면 연환산·샤프를 계산하지 않는다(화면은 'N/A (3개월 미만)').

    회귀 방지: 짧은 표본에서 연환산이 극단값으로 증폭돼(20거래일 +39% → +8043%)
    화면 안내('3개월 이상 데이터만 연환산 표시')와 어긋났다.
    """
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    # 20거래일(3개월 미만)
    _seed_prices("005930", [100 + i for i in range(20)])
    _seed_prices("000660", [200 + i for i in range(20)])

    body = comparison.compare(["005930", "000660"], "2026-07-01", "2026-07-31")
    s = body["statistics"]["005930"]

    assert s["data_points"] == 20
    assert s["annualized_return"] is None, "3개월 미만인데 연환산이 계산됐다"
    assert s["sharpe_ratio"] is None, "연환산이 없는데 샤프가 계산됐다"
    # 기간 수익률·변동성·최대낙폭은 짧은 표본에서도 그대로 제공한다
    assert s["period_return"] == round((119 / 100 - 1) * 100, 2)
    assert s["volatility"] is not None
    assert s["max_drawdown"] == 0.0  # 단조 상승이라 낙폭 없음


def test_annualized_present_for_long_period():
    """3개월(63거래일) 이상이면 연환산·샤프를 제공한다."""
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    # 70거래일 — 날짜가 7월을 넘어가도 되도록 넉넉한 범위로 조회한다
    with get_connection() as conn:
        for t, base in (("005930", 100), ("000660", 200)):
            for i in range(70):
                d = f"2026-{4 + i // 30:02d}-{(i % 30) + 1:02d}"
                conn.execute(
                    """INSERT INTO prices (ticker, date, open_price, high_price,
                       low_price, close_price, volume, change_pct)
                       VALUES (?, ?, ?, ?, ?, ?, 1000, 0)""",
                    (t, d, base + i, base + i, base + i, base + i),
                )

    body = comparison.compare(["005930", "000660"], "2026-04-01", "2026-07-31")
    s = body["statistics"]["005930"]

    assert s["data_points"] >= comparison.MIN_POINTS_FOR_ANNUALIZED
    assert s["annualized_return"] is not None
    assert s["sharpe_ratio"] is not None
