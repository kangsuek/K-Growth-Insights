"""카탈로그(종목발굴 유니버스) 수집 테스트: stock_catalog 적재. 워치리스트와 분리."""
import httpx
import respx
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import catalog, naver_client

client = TestClient(app)


def _catalog_url(market):
    return f"{naver_client.MSTOCKS_BASE}/marketValue/{market}"


def _page(codes):
    return {
        "stocks": [
            {"itemCode": c, "stockName": n, "stockEndType": t} for c, n, t in codes
        ]
    }


def _page_with_price(rows):
    """가격 스냅샷 필드까지 포함한 marketValue 응답."""
    return {
        "stocks": [
            {"itemCode": c, "stockName": n, "stockEndType": t,
             "closePriceRaw": cp, "fluctuationsRatio": fr,
             "accumulatedTradingVolumeRaw": vol, "marketValueRaw": mv}
            for c, n, t, cp, fr, vol, mv in rows
        ]
    }


@respx.mock
def test_sync_catalog_populates_catalog_not_watchlist():
    # 워치리스트(stocks)에 관심종목 1개 등록
    from tests.conftest import seed_stock
    seed_stock("005930", "삼성전자", "STOCK", theme="반도체")

    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(
            200,
            json=_page([
                ("005930", "삼성전자", "stock"),
                ("373220", "LG에너지솔루션", "stock"),
                ("487240", "KODEX ETF", "etf"),
            ]),
        )
    )

    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([]))
    )

    result = catalog.sync_catalog_detailed(limit=100)
    assert result["kospi_count"] == 3

    with get_connection() as conn:
        cat = {r["ticker"]: dict(r) for r in
               conn.execute("SELECT ticker, name, type, market FROM stock_catalog")}
        watch = [r["ticker"] for r in conn.execute("SELECT ticker FROM stocks")]
    # 카탈로그(발굴 유니버스)에 적재
    assert set(cat) == {"005930", "373220", "487240"}
    assert cat["487240"]["type"] == "ETF"
    assert cat["005930"]["market"] == "KOSPI"
    # 워치리스트는 그대로(카탈로그 수집이 관심종목을 오염시키지 않음)
    assert watch == ["005930"]


@respx.mock
def test_sync_catalog_detailed_returns_frontend_counts():
    # 설정 화면 '종목 목록 수집' 계약: kospi/kosdaq/etf/total/saved 카운트
    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page([
            ("005930", "삼성전자", "stock"), ("069500", "KODEX 200", "etf")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    r = client.post("/api/settings/ticker-catalog/collect", params={"limit": 50}).json()
    assert r["kospi_count"] == 2
    assert r["kosdaq_count"] == 1
    assert r["etf_count"] == 1
    assert r["total_collected"] == 3
    assert r["saved_count"] == 3


@respx.mock
def test_sync_catalog_detailed_captures_price_snapshot(monkeypatch):
    # 종목목록수집만으로 현재가·등락률·거래량·시총 스냅샷이 채워져야 한다(재조회 불필요).
    # 장 마감 후(종가 확정) 상황으로 고정한다 — 실행 시각에 따라 결과가 달라지면 안 된다.
    monkeypatch.setattr(catalog.timeutil, "is_close_confirmed", lambda now=None: True)
    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page_with_price([
            ("005930", "삼성전자", "stock", "265500", "1.92", "8707229", "1552186970424000")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    result = catalog.sync_catalog_detailed(limit=None)
    assert result["price_snapshot_saved"] is True
    with get_connection() as conn:
        row = dict(conn.execute(
            "SELECT close_price, daily_change_pct, volume, market_value, updated_at "
            "FROM stock_catalog WHERE ticker='005930'").fetchone())
    assert row["close_price"] == 265500
    assert row["daily_change_pct"] == 1.92
    assert row["volume"] == 8707229
    assert row["market_value"] == 1552186970424000
    assert row["updated_at"] is not None


@respx.mock
def test_sync_catalog_keeps_confirmed_snapshot_during_market_hours(monkeypatch):
    """장중 수집은 시세 스냅샷을 덮어쓰지 않는다.

    marketValue는 실시간 값이라 그대로 저장하면 한 행 안에서 기준일이 어긋난다 —
    시세는 당일 장중인데 같은 행의 수익률·수급(지표수집)은 직전 확정 거래일 기준이다.
    실제로 7/29 장중 수집분의 등락률(+29.87%)이 확정 종가 기준(+0.49%)과 달랐다.
    """
    # 직전 마감분(확정) 스냅샷을 미리 넣어 둔다.
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO stock_catalog
               (ticker, name, type, market, is_active, close_price, daily_change_pct,
                volume, market_value, updated_at)
               VALUES ('005930', '삼성전자', 'STOCK', 'KOSPI', 1, 100000, 0.49,
                       1000, 500, '2026-08-07 06:40:00')""")

    monkeypatch.setattr(catalog.timeutil, "is_close_confirmed", lambda now=None: False)
    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page_with_price([
            ("005930", "삼성전자", "stock", "129900", "29.87", "9999", "777")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    result = catalog.sync_catalog_detailed(limit=None)
    assert result["price_snapshot_saved"] is False

    with get_connection() as conn:
        row = dict(conn.execute(
            "SELECT close_price, daily_change_pct, volume, market_value, updated_at "
            "FROM stock_catalog WHERE ticker='005930'").fetchone())
    # 확정 스냅샷과 그 시각이 그대로 남는다.
    assert row["close_price"] == 100000
    assert row["daily_change_pct"] == 0.49
    assert row["volume"] == 1000
    assert row["updated_at"] == "2026-08-07 06:40:00"
    # 시총은 상위 N 선별 순위에만 쓰므로 장중 값이라도 갱신한다.
    assert row["market_value"] == 777


@respx.mock
def test_sync_catalog_leaves_new_ticker_price_null_during_market_hours(monkeypatch):
    """장중에 처음 들어온 종목은 확정값이 없으므로 시세를 비워 둔다(틀린 값보다 낫다)."""
    monkeypatch.setattr(catalog.timeutil, "is_close_confirmed", lambda now=None: False)
    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page_with_price([
            ("005930", "삼성전자", "stock", "129900", "29.87", "9999", "777")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    catalog.sync_catalog_detailed(limit=None)
    with get_connection() as conn:
        row = dict(conn.execute(
            "SELECT name, close_price, daily_change_pct, volume, market_value, updated_at "
            "FROM stock_catalog WHERE ticker='005930'").fetchone())
    assert row["name"] == "삼성전자"      # 종목 목록 자체는 들어온다
    assert row["market_value"] == 777
    assert row["close_price"] is None
    assert row["daily_change_pct"] is None
    assert row["volume"] is None
    assert row["updated_at"] is None


@respx.mock
def test_sync_catalog_detailed_total_dedups_across_markets():
    # KOSPI·KOSDAQ 양쪽에 동일 ticker가 나오면 total_collected는 중복을 제거해야
    # 실제 저장 건수(종목목록건수)와 일치한다.
    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page([
            ("005930", "삼성전자", "stock"), ("069500", "KODEX 200", "etf")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([
            ("196170", "알테오젠", "stock"), ("069500", "KODEX 200", "etf")]))  # 069500 중복
    )
    result = catalog.sync_catalog_detailed(limit=None)
    # 원행 4건이지만 고유 ticker 3건
    assert result["total_collected"] == 3
    assert result["saved_count"] == 3
    with get_connection() as conn:
        n = conn.execute("SELECT COUNT(*) FROM stock_catalog").fetchone()[0]
    assert n == result["total_collected"]  # 알림 == 종목목록건수


@respx.mock
def test_sync_catalog_detailed_prunes_stale_rows():
    # 전체 수집(limit=None)은 이번에 반환되지 않은 잔존 행을 삭제해야 한다.
    with get_connection() as conn:
        conn.execute("INSERT INTO stock_catalog (ticker, name, type, market) "
                     "VALUES ('999999','상장폐지종목','STOCK','KOSPI')")
    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page([("005930", "삼성전자", "stock")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    result = catalog.sync_catalog_detailed(limit=None)
    assert result["removed_count"] == 1
    assert result["total_collected"] == 2
    with get_connection() as conn:
        tickers = {r["ticker"] for r in conn.execute("SELECT ticker FROM stock_catalog")}
    assert tickers == {"005930", "196170"}  # 잔존 종목 삭제됨


@respx.mock
def test_sync_catalog_detailed_partial_does_not_prune():
    # 부분 수집(limit 지정)은 다른 종목을 지우면 안 된다.
    with get_connection() as conn:
        conn.execute("INSERT INTO stock_catalog (ticker, name, type, market) "
                     "VALUES ('999999','기존종목','STOCK','KOSPI')")
    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page([("005930", "삼성전자", "stock")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    result = catalog.sync_catalog_detailed(limit=50)
    assert result["removed_count"] == 0
    with get_connection() as conn:
        tickers = {r["ticker"] for r in conn.execute("SELECT ticker FROM stock_catalog")}
    assert "999999" in tickers  # 기존 종목 유지


def test_clear_catalog_endpoint():
    from app.database import get_connection
    with get_connection() as conn:
        conn.execute("INSERT INTO stock_catalog (ticker, name, type, market) VALUES ('005930','삼성전자','STOCK','KOSPI')")
    r = client.delete("/api/settings/ticker-catalog").json()
    assert r["deleted"] == 1
    with get_connection() as conn:
        assert conn.execute("SELECT COUNT(*) FROM stock_catalog").fetchone()[0] == 0


def test_catalog_progress_shape():
    body = client.get("/api/settings/ticker-catalog/collect-progress").json()
    for f in ("status", "step_index", "total_steps", "items_collected", "message"):
        assert f in body


# --- 섹터 오분류 회귀 (부분 문자열 매칭) ---------------------------------------

def test_match_sector_ignores_keyword_inside_other_words():
    """'메리츠'가 '리츠'로, 'DAISHIN'이 'AI'로 잡히던 오분류가 재발하지 않아야 한다."""
    from app.services.catalog import match_sector

    # 메리츠 ETN들은 더 이상 부동산이 아니다.
    assert match_sector("메리츠 국채30년 ETN") == "채권"
    assert match_sector("메리츠 WTI원유 선물 ETN(H)") == "원자재"
    assert match_sector("메리츠화재") == "금융"
    assert match_sector("메리츠제1호스팩") is None

    # 영문 단어에 묻힌 AI는 매칭하지 않는다.
    assert match_sector("DAISHIN343 오피스리츠플러스") == "부동산"


def test_match_sector_still_matches_legitimate_names():
    """경계 규칙이 정상 종목까지 막지 않아야 한다(한글 합성어 포함)."""
    from app.services.catalog import match_sector

    assert match_sector("SK리츠") == "부동산"
    assert match_sector("PLUS K리츠") == "부동산"
    # 리츠 상품은 '인프라'가 들어 있어도 부동산으로 분류한다.
    assert match_sector("TIGER 리츠부동산인프라") == "부동산"
    # 한글 사이에 붙은 AI는 정상 매칭.
    assert match_sector("TIGER 미국AI데이터센터TOP4Plus") == "AI/로봇"
    assert match_sector("KODEX AI전력핵심설비") == "AI/로봇"


@respx.mock
def test_sync_catalog_does_not_clobber_metric_collected_prices(monkeypatch):
    """지표수집이 채운 시세는 종목목록수집이 덮어쓰지 않는다.

    네이버의 두 API가 같은 날 다른 거래량을 준다(일별시세 8,605,755 vs marketValue
    4,796,865 — marketValue는 정규장 직후라 시간외가 빠진다). 한 컬럼을 두 경로가
    쓰면 나중에 돈 쪽이 이겨 값이 오락가락한다. 딥수집 대상은 일별시세가 소유한다.
    """
    monkeypatch.setattr(catalog.timeutil, "is_close_confirmed", lambda now=None: True)
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO stock_catalog
               (ticker, name, type, market, is_active, close_price, daily_change_pct,
                volume, market_value, updated_at, catalog_updated_at)
               VALUES ('000660', 'SK하이닉스', 'STOCK', 'KOSPI', 1, 1422000, -4.88,
                       8605755, 500, '2026-08-07 07:10:00', '2026-08-07 07:10:00')""")

    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page_with_price([
            ("000660", "SK하이닉스", "stock", "1422000", "-4.88", "4796865", "777")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    catalog.sync_catalog_detailed(limit=None)

    with get_connection() as conn:
        row = dict(conn.execute(
            "SELECT volume, close_price, market_value FROM stock_catalog "
            "WHERE ticker='000660'").fetchone())
    assert row["volume"] == 8605755      # 일별시세 값 유지
    assert row["close_price"] == 1422000
    assert row["market_value"] == 777    # 시총은 갱신


@respx.mock
def test_sync_catalog_fills_prices_for_tickers_without_metrics(monkeypatch):
    """지표수집 대상 밖 종목은 marketValue 스냅샷으로 계속 채운다."""
    monkeypatch.setattr(catalog.timeutil, "is_close_confirmed", lambda now=None: True)
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO stock_catalog (ticker, name, type, market, is_active, volume)
               VALUES ('210980', 'SK디앤디', 'STOCK', 'KOSPI', 1, 1)""")

    respx.get(_catalog_url("KOSPI")).mock(
        return_value=httpx.Response(200, json=_page_with_price([
            ("210980", "SK디앤디", "stock", "5230", "-11.95", "1191259", "97300000000")]))
    )
    respx.get(_catalog_url("KOSDAQ")).mock(
        return_value=httpx.Response(200, json=_page([("196170", "알테오젠", "stock")]))
    )
    catalog.sync_catalog_detailed(limit=None)

    with get_connection() as conn:
        row = dict(conn.execute(
            "SELECT close_price, daily_change_pct, volume, updated_at FROM stock_catalog "
            "WHERE ticker='210980'").fetchone())
    assert row["close_price"] == 5230
    assert row["daily_change_pct"] == -11.95
    assert row["volume"] == 1191259
    assert row["updated_at"] is not None
