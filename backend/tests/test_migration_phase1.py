"""이식 Phase 1 백엔드 계약 테스트: market·etfs·data 확장."""
import httpx
import respx
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import naver_client
from tests.conftest import seed_stock

client = TestClient(app)


def _seed_prices(ticker, closes):
    with get_connection() as conn:
        for i, c in enumerate(closes):
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES (?, ?, ?, ?, ?, ?, 1000, 0.5)""",
                (ticker, f"2026-07-{i + 1:02d}", c, c, c, c),
            )


# --- market ------------------------------------------------------------------

@respx.mock
def test_market_overview_returns_indices():
    for code in ("KOSPI", "KOSDAQ"):
        respx.get(f"{naver_client.MINDEX_BASE}/{code}/basic").mock(
            return_value=httpx.Response(
                200,
                json={
                    "closePrice": "7,116.14",
                    "compareToPreviousClosePrice": "368.19",
                    "fluctuationsRatio": "5.46",
                },
            )
        )
    body = client.get("/api/market/overview").json()
    names = {i["name"] for i in body["indices"]}
    assert names == {"코스피", "코스닥"}
    assert body["indices"][0]["close_price"] == 7116.14


@respx.mock
def test_index_chart_shape():
    respx.get(f"{naver_client.MINDEX_BASE}/KOSPI/price").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"localTradedAt": "2026-07-21", "closePrice": "7,100", "openPrice": "7,000",
                 "highPrice": "7,150", "lowPrice": "6,990", "accumulatedTradingVolume": "0"},
            ],
        )
    )
    body = client.get("/api/market/index/KOSPI/chart?period=1M").json()
    assert body["code"] == "KOSPI"
    assert body["data"][0]["close"] == 7100.0
    assert "open" in body["data"][0]


def test_index_chart_unknown_code_empty():
    body = client.get("/api/market/index/NASDAQ/chart").json()
    assert body["data"] == []


@respx.mock
def test_index_intraday_shape_with_change_computed_from_basic():
    respx.get(f"{naver_client.MINDEX_BASE}/KOSPI/basic").mock(
        return_value=httpx.Response(
            200,
            json={
                "closePrice": "2,650.00",
                "compareToPreviousClosePrice": "50.00",
                "fluctuationsRatio": "1.92",
            },
        )
    )
    respx.get(f"{naver_client.CHART_BASE_INDEX}/KOSPI/minute").mock(
        return_value=httpx.Response(
            200,
            json=[{"localDateTime": "20260722090000", "currentPrice": 2610.0}],
        )
    )
    body = client.get("/api/market/index/KOSPI/intraday").json()
    assert body["code"] == "KOSPI"
    assert body["count"] == 1
    row = body["data"][0]
    assert row["price"] == 2610.0
    # 전일종가 = 2650 - 50 = 2600 → 2610 - 2600 = +10
    assert row["change_amount"] == 10.0


def test_index_intraday_unknown_code_empty():
    body = client.get("/api/market/index/NASDAQ/intraday").json()
    assert body["data"] == []


# --- etfs --------------------------------------------------------------------

def test_list_etfs_shape():
    seed_stock("005930", "삼성전자", "STOCK", theme="반도체")
    rows = client.get("/api/etfs/").json()
    assert rows[0]["ticker"] == "005930"
    assert rows[0]["theme"] == "반도체"
    assert "purchase_price" in rows[0]  # ETF 카드 계약 필드 존재


def test_batch_summary_computes_weekly_return():
    seed_stock("005930", "삼성전자", "STOCK")
    # 2026-07-01~07-10 연속 시세(오래된→최신). 최신은 07-10.
    _seed_prices("005930", [95, 96, 97, 98, 99, 100, 101, 102, 103, 110])
    r = client.post(
        "/api/etfs/batch-summary",
        json={"tickers": ["005930"], "price_days": 14, "news_limit": 3},
    ).json()
    s = r["data"]["005930"]
    assert s["latest_price"]["close_price"] == 110  # 최신
    assert s["prices"][0]["close_price"] == 110     # prices는 최신→오래된 순
    # weekly_return = 최신(07-10) / 7일 전(07-03=97). 네이버 W1과 같은 기준이며
    # 발굴(scanner)·인사이트와도 같다 — metrics.weekly_return 참조.
    assert round(s["weekly_return"], 1) == round((110 / 97 - 1) * 100, 1)


def test_etf_detail_404_for_unknown():
    assert client.get("/api/etfs/999999").status_code == 404


def test_etf_detail_includes_purchase_info():
    """상세 응답에 구매 정보가 있어야 한다.

    회귀 방지: 이 값이 빠져 있으면 상세 화면의 매입가 기준선(가격 차트·분봉),
    매입가 카드, 수익률·평가금액이 모두 조용히 사라진다.
    """
    seed_stock("005930", "삼성전자", "STOCK", theme="반도체")
    client.put("/api/settings/stocks/005930", json={
        "purchase_date": "2026-07-24", "purchase_price": 165200, "quantity": 535,
    })

    body = client.get("/api/etfs/005930").json()

    assert body["purchase_price"] == 165200
    assert body["quantity"] == 535
    assert body["purchase_date"] == "2026-07-24"
    assert body["name"] == "삼성전자" and body["theme"] == "반도체"


def test_etf_detail_purchase_info_null_when_unset():
    """구매 정보를 넣지 않은 종목은 null로 온다(키 자체는 있어야 한다)."""
    seed_stock("000660", "SK하이닉스", "STOCK")

    body = client.get("/api/etfs/000660").json()

    assert body["purchase_price"] is None
    assert body["quantity"] is None
    assert body["purchase_date"] is None


# --- data 확장 ---------------------------------------------------------------

def test_scheduler_status_shape():
    body = client.get("/api/data/scheduler-status").json()
    assert "scheduler" in body
    assert "last_collection_time" in body["scheduler"]


def test_reset_clears_collected_data():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_prices("005930", [100, 101])
    r = client.delete("/api/data/reset").json()
    assert r["reset"] is True
    with get_connection() as conn:
        n = conn.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
        s = conn.execute("SELECT COUNT(*) FROM stocks").fetchone()[0]
    assert n == 0      # 시세 삭제됨
    assert s == 1      # 종목 목록은 보존


def test_etf_prices_returned_newest_first():
    """상세 prices는 원본과 동일하게 최신순(DESC)."""
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_prices("005930", [100, 101, 102])  # 07-01, 07-02, 07-03
    rows = client.get("/api/etfs/005930/prices?days=10").json()
    assert rows[0]["date"] == "2026-07-03"   # 최신이 먼저
    assert rows[-1]["date"] == "2026-07-01"


def test_etf_fundamentals_holdings_field_mapping():
    """구성종목은 프론트 계약(stock_code/stock_name/daily_change_pct)으로 매핑."""
    seed_stock("487240", "KODEX ETF", "ETF")
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO etf_holdings (ticker, seq, item_code, item_name, weight) VALUES (?,?,?,?,?)",
            ("487240", 1, "005930", "삼성전자", 20.5),
        )
    body = client.get("/api/etfs/487240/fundamentals").json()
    h = body["holdings"][0]
    assert h["stock_code"] == "005930"
    assert h["stock_name"] == "삼성전자"
    assert h["weight"] == 20.5
    assert "daily_change_pct" in h


def test_etf_prices_range_filter():
    """상세 차트: start_date/end_date로 기간 필터(1년치 등)."""
    seed_stock("005930", "삼성전자", "STOCK")
    with get_connection() as conn:
        for m in range(1, 13):  # 2026-01 ~ 2026-12, 월 1건
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES ('005930', ?, 100, 100, 100, 100, 1000, 0)""",
                (f"2026-{m:02d}-15",),
            )
    # 기간 필터: 3~6월 → 4건 (auto_collect=False로 순수 필터만 검증)
    rows = client.get("/api/etfs/005930/prices",
                      params={"start_date": "2026-03-01", "end_date": "2026-06-30",
                              "auto_collect": False}).json()
    assert len(rows) == 4
    # 기본(days)은 60 제한이지만 range는 제한 없이 해당 구간 전체
    all_rows = client.get("/api/etfs/005930/prices",
                          params={"start_date": "2026-01-01", "end_date": "2026-12-31",
                                  "auto_collect": False}).json()
    assert len(all_rows) == 12  # 1년 전체


def test_etf_intraday_falls_back_to_previous_day():
    """당일 분봉이 없으면 직전 거래일 분봉을 rich 객체로 반환한다."""
    seed_stock("005930", "삼성전자", "STOCK")
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO prices (ticker, date, open_price, high_price,
               low_price, close_price, volume, change_pct)
               VALUES ('005930', '2026-07-21', 100, 100, 100, 100, 1000, 0)""",
        )
        for i, hhmm in enumerate(("09:00", "09:01", "15:30")):
            conn.execute(
                """INSERT INTO intraday_prices (ticker, datetime, open_price,
                   high_price, low_price, price, volume)
                   VALUES ('005930', ?, 110, 112, 108, ?, 500)""",
                (f"2026-07-22T{hhmm}:00", 110 + i),
            )
    # auto_collect=False로 실제 네트워크 수집을 막고, 조회 계약만 검증한다.
    body = client.get("/api/etfs/005930/intraday",
                      params={"auto_collect": False}).json()
    assert body["date"] == "2026-07-22"      # 직전 거래일로 폴백
    assert body["count"] == 3
    assert body["first_time"] == "09:00"
    assert body["last_time"] == "15:30"
    # 전일(07-21) 종가 100 대비 전일비 계산 확인
    assert body["data"][0]["change_amount"] == 10.0


def test_etf_intraday_target_date_falls_back_to_previous_day():
    """target_date를 지정했는데 그 날짜에 분봉이 없으면(휴장일 등) 직전 거래일로 폴백한다."""
    seed_stock("005930", "삼성전자", "STOCK")
    with get_connection() as conn:
        for i, hhmm in enumerate(("09:00", "09:01", "15:30")):
            conn.execute(
                """INSERT INTO intraday_prices (ticker, datetime, open_price,
                   high_price, low_price, price, volume)
                   VALUES ('005930', ?, 110, 112, 108, ?, 500)""",
                (f"2026-07-22T{hhmm}:00", 110 + i),
            )
    # 2026-07-23(예: 휴장일)을 명시했지만 데이터가 없으므로 직전 거래일(07-22)로 폴백한다.
    body = client.get(
        "/api/etfs/005930/intraday",
        params={"target_date": "2026-07-23", "auto_collect": False},
    ).json()
    assert body["date"] == "2026-07-22"
    assert body["count"] == 3


def _seed_flow(ticker, dates):
    with get_connection() as conn:
        for d in dates:
            conn.execute(
                """INSERT INTO trading_flow (ticker, date, individual_net,
                   institutional_net, foreign_net, foreign_hold_ratio)
                   VALUES (?, ?, 0, 0, 0, 0)""", (ticker, d))


@respx.mock
def test_trading_flow_range_backfills_missing_history():
    """기간 조회 시 보유분이 짧으면 과거 이력을 백필해 기간을 맞춘다."""
    from app.routers import etfs
    etfs._backfilled["flow"].clear()
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_flow("005930", ["2026-07-21", "2026-07-22"])  # 최근 2건만 보유
    # trend API가 과거 창까지 반환(역페이지네이션 mock)
    respx.get(f"{naver_client.MSTOCK_BASE}/005930/trend").mock(
        return_value=httpx.Response(200, json=[
            {"bizdate": bd, "individualPureBuyQuant": "0", "organPureBuyQuant": "0",
             "foreignerPureBuyQuant": "0", "foreignerHoldRatio": "0"}
            for bd in ("20260610", "20260701", "20260715", "20260722")
        ])
    )
    body = client.get("/api/etfs/005930/trading-flow",
                      params={"start_date": "2026-06-01", "end_date": "2026-07-31"}).json()
    dates = [r["date"] for r in body]
    assert "2026-06-10" in dates          # 백필된 과거 데이터 포함
    assert dates == sorted(dates, reverse=True)   # 최신→오래된(시세와 동일)


def test_trading_flow_range_no_autocollect_uses_db_only():
    """auto_collect=False면 네트워크 백필 없이 보유분만 반환한다."""
    from app.routers import etfs
    etfs._backfilled["flow"].clear()
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_flow("005930", ["2026-07-21", "2026-07-22"])
    body = client.get("/api/etfs/005930/trading-flow",
                      params={"start_date": "2026-01-01", "end_date": "2026-07-31",
                              "auto_collect": False}).json()
    assert [r["date"] for r in body] == ["2026-07-22", "2026-07-21"]


def test_trading_flow_days_and_range_share_same_order():
    """days 조회와 기간 조회가 같은 정렬(최신순)로 나와야 한다.

    두 분기의 정렬이 달라, 최신순을 가정하는 인사이트가 기간 조회 결과에서
    가장 오래된 구간을 '최근'으로 읽어 반대 결론을 내던 회귀를 막는다.
    """
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_flow("005930", ["2026-07-20", "2026-07-21", "2026-07-22"])
    by_days = client.get("/api/etfs/005930/trading-flow",
                         params={"days": 3, "auto_collect": False}).json()
    by_range = client.get("/api/etfs/005930/trading-flow",
                          params={"start_date": "2026-07-01", "end_date": "2026-07-31",
                                  "auto_collect": False}).json()
    expected = ["2026-07-22", "2026-07-21", "2026-07-20"]
    assert [r["date"] for r in by_days] == expected
    assert [r["date"] for r in by_range] == expected


def test_prices_days_and_range_share_same_order():
    """시세도 days/기간 조회가 모두 최신순이어야 한다(매매동향과 같은 계약)."""
    seed_stock("005930", "삼성전자", "STOCK")
    with get_connection() as conn:
        for d in ("2026-07-20", "2026-07-21", "2026-07-22"):
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume)
                   VALUES (?, ?, 100, 100, 100, 100, 1)""", ("005930", d))
    by_days = client.get("/api/etfs/005930/prices",
                         params={"days": 3, "auto_collect": False}).json()
    by_range = client.get("/api/etfs/005930/prices",
                          params={"start_date": "2026-07-01", "end_date": "2026-07-31",
                                  "auto_collect": False}).json()
    expected = ["2026-07-22", "2026-07-21", "2026-07-20"]
    assert [r["date"] for r in by_days] == expected
    assert [r["date"] for r in by_range] == expected


@respx.mock
def test_prices_range_backfills_missing_history():
    """기간 조회 시 보유 시세가 짧으면 과거 이력을 백필해 기간을 맞춘다."""
    from app.routers import etfs
    etfs._backfilled["prices"].clear()
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_prices("005930", [100, 101])  # 최근 2건만(날짜는 헬퍼가 최근 기준 부여)
    # 일별시세 API가 과거까지 반환(mock)
    respx.get(f"{naver_client.MSTOCK_BASE}/005930/price").mock(
        return_value=httpx.Response(200, json=[
            {"localTradedAt": d, "closePrice": "100", "openPrice": "100",
             "highPrice": "100", "lowPrice": "100", "accumulatedTradingVolume": "1000",
             "fluctuationsRatio": "0.5"}
            for d in ("2026-03-02", "2026-05-01", "2026-07-01")
        ])
    )
    body = client.get("/api/etfs/005930/prices",
                      params={"start_date": "2026-02-01", "end_date": "2026-07-31"}).json()
    dates = [r["date"] for r in body]
    assert "2026-03-02" in dates  # 백필된 과거 시세 포함


# --- 마지막 수집일시 ----------------------------------------------------------

def test_last_collection_time_includes_prices_and_trading_flow():
    """시세·매매동향 수집도 '마지막 수집일시'에 반영된다.

    예전에는 뉴스·펀더멘털·구성종목만 봐서, 시세만 새로 수집되면 표시가 옛날에
    멈춰 있었다. 대시보드가 실제로 보는 값이 시세·매매동향이므로 포함해야 한다.
    """
    from app.services import repository

    assert repository.last_collection_time() is None  # 수집 이력 없음

    with get_connection() as conn:
        conn.execute(
            """INSERT INTO prices (ticker, date, close_price, updated_at)
               VALUES ('005930', '2026-07-29', 100, '2026-07-29 01:00:00')"""
        )
    assert repository.last_collection_time().startswith("2026-07-29T10:00:00")

    # 더 나중에 수집된 매매동향이 있으면 그쪽이 최신이다
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO trading_flow (ticker, date, foreign_net, updated_at)
               VALUES ('005930', '2026-07-29', 10, '2026-07-29 02:30:00')"""
        )
    assert repository.last_collection_time().startswith("2026-07-29T11:30:00")


def test_collect_stock_stamps_updated_at(monkeypatch):
    """시세 수집이 updated_at을 채운다."""
    from app.services import collectors, naver_client

    monkeypatch.setattr(naver_client, "fetch_daily_prices", lambda *a, **k: [
        {"date": "2026-07-29", "open_price": 1, "high_price": 2, "low_price": 1,
         "close_price": 2, "volume": 10, "change_pct": 1.0},
    ])
    collectors.collect_prices("005930")

    with get_connection() as conn:
        row = conn.execute("SELECT updated_at FROM prices WHERE ticker='005930'").fetchone()
    assert row["updated_at"] is not None


def test_collect_trading_flow_stamps_updated_at(monkeypatch):
    """매매동향 수집이 updated_at을 채운다."""
    from app.services import collectors, naver_client

    monkeypatch.setattr(naver_client, "fetch_trading_flow", lambda *a, **k: [
        {"date": "2026-07-29", "individual_net": 1, "institutional_net": 2,
         "foreign_net": 3, "foreign_hold_ratio": 0.5},
    ])
    collectors.collect_trading_flow("005930")

    with get_connection() as conn:
        row = conn.execute(
            "SELECT updated_at FROM trading_flow WHERE ticker='005930'").fetchone()
    assert row["updated_at"] is not None
