"""Phase 4(종목 발굴) 테스트: 검색·필터·정렬·테마·추천 — stock_catalog 기반."""
from datetime import datetime

from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import naver_client, scanner
from app.timeutil import KST
from tests.conftest import seed_stock

client = TestClient(app)


def _seed_catalog(rows):
    """(ticker, name, type, market, sector, weekly, volume, foreign_net) 시드."""
    with get_connection() as conn:
        for t, name, ty, mkt, sector, wr, vol, fn in rows:
            conn.execute(
                """INSERT INTO stock_catalog
                   (ticker, name, type, market, sector, is_active, close_price,
                    weekly_return, volume, foreign_net, catalog_updated_at)
                   VALUES (?, ?, ?, ?, ?, 1, 1000, ?, ?, ?, '2026-07-22 09:00:00')""",
                (t, name, ty, mkt, sector, wr, vol, fn),
            )


def test_search_filters_sorts_paginates():
    _seed_catalog([
        ("069500", "KODEX 200", "ETF", "KOSPI", "지수", 5.0, 1000, 100),
        ("487240", "KODEX AI", "ETF", "KOSPI", "AI", 12.0, 500, -50),
        ("305720", "KODEX 2차전지", "ETF", "KOSPI", "2차전지", 8.0, 2000, 300),
    ])
    body = client.get("/api/scanner", params={"type": "ETF", "sort_by": "weekly_return"}).json()
    assert body["total"] == 3
    # weekly_return 내림차순
    assert [i["ticker"] for i in body["items"]] == ["487240", "305720", "069500"]
    assert "is_registered" in body["items"][0]


def test_search_foreign_positive_filter():
    _seed_catalog([
        ("069500", "KODEX 200", "ETF", "KOSPI", "지수", 5.0, 1000, 100),
        ("487240", "KODEX AI", "ETF", "KOSPI", "AI", 12.0, 500, -50),
    ])
    body = client.get("/api/scanner", params={"foreign_net_positive": "true"}).json()
    assert {i["ticker"] for i in body["items"]} == {"069500"}


def test_search_signal_alert_filter():
    """signal_alert=true는 MACD 크로스 또는 RSI 구간 진입이 있는 종목만 남긴다."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO stock_catalog
               (ticker, name, type, market, is_active, close_price,
                macd_cross_signal, rsi_zone_entered, catalog_updated_at)
               VALUES ('069500', 'KODEX 200', 'ETF', 'KOSPI', 1, 1000,
                       'golden', NULL, '2026-07-22 09:00:00')"""
        )
        conn.execute(
            """INSERT INTO stock_catalog
               (ticker, name, type, market, is_active, close_price,
                macd_cross_signal, rsi_zone_entered, catalog_updated_at)
               VALUES ('487240', 'KODEX AI', 'ETF', 'KOSPI', 1, 1000,
                       NULL, 'oversold', '2026-07-22 09:00:00')"""
        )
        conn.execute(
            """INSERT INTO stock_catalog
               (ticker, name, type, market, is_active, close_price, catalog_updated_at)
               VALUES ('305720', 'KODEX 2차전지', 'ETF', 'KOSPI', 1, 1000,
                       '2026-07-22 09:00:00')"""
        )

    body = client.get("/api/scanner", params={"signal_alert": "true"}).json()
    assert {i["ticker"] for i in body["items"]} == {"069500", "487240"}

    without_filter = client.get("/api/scanner").json()
    assert without_filter["total"] == 3

    item = next(i for i in body["items"] if i["ticker"] == "069500")
    assert item["macd_cross_signal"] == "golden"
    assert item["rsi_zone_entered"] is None


def test_search_is_registered_marks_watchlist():
    seed_stock("069500", "KODEX 200", "ETF")  # 워치리스트 등록
    _seed_catalog([("069500", "KODEX 200", "ETF", "KOSPI", "지수", 5.0, 1000, 100)])
    body = client.get("/api/scanner", params={"type": "ETF"}).json()
    assert body["items"][0]["is_registered"] is True


def test_themes_group_by_sector():
    _seed_catalog([
        ("069500", "KODEX 200", "ETF", "KOSPI", "지수", 5.0, 1000, 100),
        ("487240", "KODEX AI", "ETF", "KOSPI", "AI", 12.0, 500, -50),
        ("305720", "KODEX 2차", "ETF", "KOSPI", "AI", 8.0, 2000, 300),
    ])
    body = client.get("/api/scanner/themes").json()
    ai = next(t for t in body if t["sector"] == "AI")
    assert ai["count"] == 2
    assert len(ai["top_performers"]) == 2


def test_recommendations_presets():
    _seed_catalog([
        ("069500", "KODEX 200", "ETF", "KOSPI", "지수", 5.0, 1000, 100),
        ("487240", "KODEX AI", "ETF", "KOSPI", "AI", 12.0, 500, -50),
    ])
    body = client.get("/api/scanner/recommendations").json()
    ids = {p["preset_id"] for p in body}
    assert "weekly_top_return" in ids and "foreign_buying" in ids
    top = next(p for p in body if p["preset_id"] == "weekly_top_return")
    assert top["items"][0]["ticker"] == "487240"  # 주간수익률 최고


def test_collect_progress_idle_default():
    body = client.get("/api/scanner/collect-progress").json()
    assert "status" in body


def test_supply_targets_selects_top_n_and_all_etf(monkeypatch):
    # 딥수집 대상: 전체 ETF + KOSPI 시총 상위 N + KOSDAQ 시총 상위 N
    monkeypatch.setattr(scanner, "KOSPI_TOP_N_SUPPLY", 2)
    monkeypatch.setattr(scanner, "KOSDAQ_TOP_N_SUPPLY", 1)
    with get_connection() as conn:
        def ins(ticker, ty, mkt, mv):
            conn.execute(
                "INSERT INTO stock_catalog (ticker, name, type, market, is_active, market_value) "
                "VALUES (?, ?, ?, ?, 1, ?)", (ticker, ticker, ty, mkt, mv))
        # ETF 2개(시총 무관 전부 포함)
        ins("069500", "ETF", "ETF", 10); ins("487240", "ETF", "ETF", 5)
        # KOSPI 3개 → 상위 2개(시총 300, 200)만
        ins("005930", "STOCK", "KOSPI", 300); ins("000660", "STOCK", "KOSPI", 200)
        ins("111111", "STOCK", "KOSPI", 100)
        # KOSDAQ 2개 → 상위 1개(시총 90)만
        ins("196170", "STOCK", "KOSDAQ", 90); ins("222222", "STOCK", "KOSDAQ", 10)
    with get_connection() as conn:
        groups = scanner._supply_target_groups(conn)
        targets = {t for _, tickers in groups for t in tickers}
    assert targets == {"069500", "487240", "005930", "000660", "196170"}
    assert "111111" not in targets  # KOSPI 상위 N 밖
    assert "222222" not in targets  # KOSDAQ 상위 N 밖
    assert [label for label, _ in groups] == ["ETF", "코스피", "코스닥"]  # 진행률 단계 순서


def test_search_returns_price_and_metric_timestamps_separately():
    """시세와 지표 수집 시각을 따로 내려준다.

    수익률·수급은 발굴 지표수집만 채우지만 현재가·등락률·거래량은 종목목록수집도
    쓰므로, 한쪽만 다시 돌면 기준 시점이 어긋난다. 화면이 이를 구분해 보여줄 수
    있도록 두 시각을 모두 노출한다.
    """
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO stock_catalog
               (ticker, name, type, market, is_active, close_price, weekly_return,
                updated_at, catalog_updated_at)
               VALUES ('069500', 'KODEX 200', 'ETF', 'ETF', 1, 1000, 5.0,
                       '2026-07-28 01:00:00', '2026-07-26 10:11:00')"""
        )
    item = client.get("/api/scanner", params={"type": "ETF"}).json()["items"][0]

    # UTC로 저장된 값이 KST(+9)로 변환돼 나온다
    assert item["price_updated_at"].startswith("2026-07-28T10:00:00")
    assert item["catalog_updated_at"].startswith("2026-07-26T19:11:00")


def test_search_price_timestamp_is_none_when_never_synced():
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO stock_catalog (ticker, name, type, market, is_active, updated_at) "
            "VALUES ('069500', 'KODEX 200', 'ETF', 'ETF', 1, NULL)"
        )
    item = client.get("/api/scanner", params={"type": "ETF"}).json()["items"][0]
    assert item["price_updated_at"] is None


def test_price_timestamp_follows_metric_collect_when_it_ran_later():
    """지표수집이 나중에 돌았으면 시세 시각도 그때다.

    지표수집(_collect_one)은 수익률·수급뿐 아니라 현재가·등락률·거래량도 다시 쓴다.
    updated_at만 보면 방금 갱신된 시세를 오래된 것으로 표시하게 된다.
    """
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO stock_catalog
               (ticker, name, type, market, is_active, close_price, weekly_return,
                updated_at, catalog_updated_at)
               VALUES ('069500', 'KODEX 200', 'ETF', 'ETF', 1, 1000, 5.0,
                       '2026-07-26 10:10:25', '2026-07-29 02:41:06')"""
        )
    item = client.get("/api/scanner", params={"type": "ETF"}).json()["items"][0]

    assert item["price_updated_at"].startswith("2026-07-29T11:41:06")
    assert item["catalog_updated_at"].startswith("2026-07-29T11:41:06")


# --- 기준 거래일 정합성 -------------------------------------------------------

def _price(day, close):
    return {"date": day, "close_price": close, "change_pct": 1.0, "volume": 100}


def test_confirmed_prices_drops_intraday_row_before_market_close():
    """장 마감 전에는 당일(미확정) 행을 버린다.

    네이버 일별시세는 장중에도 오늘 행을 현재가로 내려준다. 그걸 종가로 저장하면
    가격은 당일 장중, 수급은 전일 확정치가 되어 한 행 안에서 기준일이 어긋났다.
    """
    rows = [_price("2026-07-30", 110), _price("2026-07-29", 100)]
    intraday = datetime(2026, 7, 30, 10, 6, tzinfo=KST)   # 장중
    assert [r["date"] for r in scanner.confirmed_prices(rows, intraday)] == ["2026-07-29"]

    after_close = datetime(2026, 7, 30, 15, 40, tzinfo=KST)
    assert [r["date"] for r in scanner.confirmed_prices(rows, after_close)] == \
        ["2026-07-30", "2026-07-29"]


def test_metrics_align_price_and_flow_on_same_trading_day(monkeypatch):
    """장중 수집이라도 가격·수급·수익률이 같은 거래일 기준으로 저장된다."""
    monkeypatch.setattr(
        scanner, "confirmed_prices",
        lambda prices, now=None: [p for p in prices if p["date"] < "2026-07-30"])
    monkeypatch.setattr(naver_client, "fetch_daily_prices", lambda code, pages=1: [
        _price("2026-07-30", 999),    # 장중 미확정 → 버려져야 한다
        _price("2026-07-29", 120),
        _price("2026-07-22", 100),    # 7일 전 — 주간 기준일
        _price("2026-06-29", 80),     # 전월 같은 날 — 월간 기준일
        _price("2025-12-30", 60),     # 전년 마지막 거래일 — YTD 기준일
    ])
    monkeypatch.setattr(naver_client, "fetch_trading_flow", lambda code, **kw: [
        {"date": "2026-07-30", "foreign_net": 777, "institutional_net": 888},
        {"date": "2026-07-29", "foreign_net": 111, "institutional_net": 222},
    ])

    m = scanner._metrics_for("069500")
    assert m["metrics_date"] == "2026-07-29"
    assert m["close_price"] == 120                      # 확정 종가
    assert m["foreign_net"] == 111                      # 같은 날 수급
    assert m["institutional_net"] == 222
    assert round(m["weekly_return"], 4) == round((120 / 100 - 1) * 100, 4)
    assert round(m["monthly_return"], 4) == round((120 / 80 - 1) * 100, 4)
    assert round(m["ytd_return"], 4) == round((120 / 60 - 1) * 100, 4)
    assert m["ytd_base_date"] == "2025-12-30"




# --- 상승(+) 필터 -------------------------------------------------------------

def _seed_returns(rows):
    """(ticker, 등락률, 주간, 월간, 연간) 시드 — 상승 필터 검증용."""
    with get_connection() as conn:
        for t, dc, wr, mr, yr in rows:
            conn.execute(
                """INSERT INTO stock_catalog
                   (ticker, name, type, market, is_active, close_price,
                    daily_change_pct, weekly_return, monthly_return, ytd_return,
                    catalog_updated_at)
                   VALUES (?, ?, 'ETF', 'ETF', 1, 1000, ?, ?, ?, ?,
                           '2026-08-07 07:00:00')""",
                (t, t, dc, wr, mr, yr),
            )


def _search(**params):
    body = client.get("/api/scanner", params={"type": "ETF", **params}).json()
    return [i["ticker"] for i in body["items"]]


def test_positive_filters_each_column():
    """등락률·주간·월간·연간 각각의 '+만 보기' 토글."""
    _seed_returns([
        ("AAA", 1.0, 1.0, 1.0, 1.0),      # 전부 +
        ("BBB", -1.0, 2.0, 2.0, 2.0),     # 등락률만 -
        ("CCC", 1.0, -2.0, 2.0, 2.0),     # 주간만 -
        ("DDD", 1.0, 2.0, -2.0, 2.0),     # 월간만 -
        ("EEE", 1.0, 2.0, 2.0, -2.0),     # 연간만 -
    ])
    assert set(_search(daily_change_positive="true")) == {"AAA", "CCC", "DDD", "EEE"}
    assert set(_search(weekly_return_positive="true")) == {"AAA", "BBB", "DDD", "EEE"}
    assert set(_search(monthly_return_positive="true")) == {"AAA", "BBB", "CCC", "EEE"}
    assert set(_search(ytd_return_positive="true")) == {"AAA", "BBB", "CCC", "DDD"}


def test_positive_filters_combine_and_sort_by_weekly_desc():
    """네 조건을 모두 켜면 전부 +인 종목만 남고, 기본 정렬은 주간수익률 내림차순."""
    _seed_returns([
        ("AAA", 1.0, 5.0, 1.0, 1.0),
        ("BBB", 1.0, 9.0, 1.0, 1.0),
        ("CCC", 1.0, 7.0, 1.0, 1.0),
        ("XXX", 1.0, 9.9, 1.0, -1.0),     # 연간이 - 라 빠진다
    ])
    assert _search(daily_change_positive="true", weekly_return_positive="true",
                   monthly_return_positive="true", ytd_return_positive="true") == \
        ["BBB", "CCC", "AAA"]


def test_positive_filters_exclude_zero_and_null():
    """보합(0)과 미수집(NULL)은 '+'가 아니다.

    최소%(min_*) 입력은 `>= 0`이라 보합도 걸린다. 그래서 토글을 따로 뒀다.
    """
    _seed_returns([
        ("POS", 1.0, 1.0, 1.0, 1.0),
        ("ZERO", 0.0, 0.0, 0.0, 0.0),
        ("NULLS", None, None, None, None),
    ])
    assert _search(daily_change_positive="true") == ["POS"]
    assert _search(weekly_return_positive="true") == ["POS"]
    # 최소 0%는 보합을 포함한다(토글과 다른 동작).
    assert set(_search(min_weekly_return=0)) == {"POS", "ZERO"}


# --- 지속 상승추세 필터 --------------------------------------------------------

def _seed_trend(rows):
    """(ticker, ytd, r2, mdd, win_rate, above_ma) 시드."""
    with get_connection() as conn:
        for t, ytd, r2, mdd, wr, ma in rows:
            conn.execute(
                """INSERT INTO stock_catalog
                   (ticker, name, type, market, is_active, close_price, weekly_return,
                    ytd_return, trend_r2, trend_mdd, trend_win_rate, trend_above_ma,
                    catalog_updated_at)
                   VALUES (?, ?, 'ETF', 'ETF', 1, 1000, 1.0, ?, ?, ?, ?, ?,
                           '2026-08-07 07:00:00')""",
                (t, t, ytd, r2, mdd, wr, ma),
            )


def _uptrend_search():
    body = client.get("/api/scanner",
                      params={"type": "ETF", "sustained_uptrend": "true"}).json()
    return {i["ticker"] for i in body["items"]}


def test_sustained_uptrend_filter_keeps_steady_risers():
    _seed_trend([
        ("STEADY", 23.7, 87, -5.1, 62, 73),    # 꾸준히 상승
        ("CRASHED", 132.4, 77, -53.5, 50, 55),  # 수익률은 크지만 반토막 난 적 있음
        ("CHOPPY", 20.0, 40, -10.0, 62, 65),    # 직선성 낮음
        ("WEAKMON", 20.0, 80, -10.0, 40, 65),   # 월승률 낮음
        ("OFFMA", 20.0, 80, -10.0, 62, 40),     # 20일선 이탈 잦음
    ])
    assert _uptrend_search() == {"STEADY"}


def test_sustained_uptrend_excludes_cash_like_etfs():
    """머니마켓·CD금리류는 R² 100%·낙폭 0%지만 연 1~2%짜리라 제외한다."""
    _seed_trend([
        ("MMF", 2.0, 100, -0.02, 88, 100),      # 현금성 — 낙폭이 사실상 없다
        ("EQUITY", 15.0, 86, -9.5, 75, 73),
    ])
    assert _uptrend_search() == {"EQUITY"}


def test_sustained_uptrend_excludes_uncollected():
    """추세 지표가 없는 종목(NULL)은 판정할 수 없으므로 빠진다."""
    _seed_trend([("GOOD", 23.7, 87, -5.1, 62, 73)])
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO stock_catalog (ticker, name, type, market, is_active,
               close_price, ytd_return) VALUES ('NULLS', 'NULLS', 'ETF', 'ETF', 1, 1000, 99)""")
    assert _uptrend_search() == {"GOOD"}


def test_sustained_uptrend_requires_positive_ytd():
    """연초 대비가 마이너스면 아무리 최근 흐름이 좋아도 '연초부터 상승'이 아니다."""
    _seed_trend([("DOWN_YTD", -3.0, 90, -8.0, 70, 80)])
    assert _uptrend_search() == set()


def test_collect_catalog_data_syncs_list_before_deep_collection(monkeypatch):
    """딥수집(데이터 수집 버튼)은 시작 전 종목목록수집을 먼저 돌려야 한다.

    금일 실시간 등락률(live_change_pct)·시총은 종목목록수집에서만 갱신되므로,
    이 단계를 건너뛰면 딥수집을 아무리 돌려도 '금일 등락률'이 계속 비어 있게 된다.
    """
    calls = []
    monkeypatch.setattr(scanner.catalog, "sync_catalog_detailed", lambda limit=None: calls.append("sync"))
    result = scanner.collect_catalog_data()
    assert calls == ["sync"]
    assert result["status"] == "completed"


def test_collect_catalog_data_continues_when_list_sync_fails(monkeypatch):
    """종목목록수집이 실패해도(네트워크 오류 등) 딥수집 자체는 계속 진행한다."""
    def _boom(limit=None):
        raise RuntimeError("network down")
    monkeypatch.setattr(scanner.catalog, "sync_catalog_detailed", _boom)
    result = scanner.collect_catalog_data()
    assert result["status"] == "completed"
