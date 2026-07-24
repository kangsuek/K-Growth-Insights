"""작업 1(펀더멘털) 통합 테스트: 파싱 → 수집 → 조회 → 엔드포인트.

네트워크는 respx로 모킹하고, DB는 conftest의 임시 DB 픽스처를 사용한다.
"""
import httpx
import respx
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import collectors, naver_client, repository
from tests.conftest import seed_stock

client = TestClient(app)


def _integration_url(code):
    return f"{naver_client.MSTOCK_BASE}/{code}/integration"


def _etf_analysis_url(code):
    return f"{naver_client.MSTOCK_BASE}/{code}/etfAnalysis"


# --- naver_client 파싱 --------------------------------------------------------

@respx.mock
def test_fetch_stock_fundamentals_parses_by_code_keys():
    respx.get(_integration_url("005930")).mock(
        return_value=httpx.Response(
            200,
            json={
                "totalInfos": [
                    {"code": "per", "value": "20.93배"},
                    {"code": "pbr", "value": "1.85배"},
                    {"code": "eps", "value": "12,372원"},
                    {"code": "dividendYieldRatio", "value": "1.20%"},
                    {"code": "foreignRate", "value": "46.59%"},
                    {"code": "marketValue", "value": "1,514조 1,862억"},
                ]
            },
        )
    )
    data = naver_client.fetch_stock_fundamentals("005930")
    assert data["per"] == 20.93
    assert data["pbr"] == 1.85
    assert data["eps"] == 12372.0
    assert data["dividend_yield"] == 1.20
    assert data["foreign_rate"] == 46.59
    # 조/억 표기는 표시용 문자열 그대로 유지
    assert data["market_value"] == "1,514조 1,862억"


@respx.mock
def test_fetch_stock_fundamentals_empty_returns_none():
    respx.get(_integration_url("000000")).mock(
        return_value=httpx.Response(200, json={"totalInfos": []})
    )
    assert naver_client.fetch_stock_fundamentals("000000") is None


@respx.mock
def test_fetch_etf_fundamentals_applies_deviation_sign():
    respx.get(_integration_url("487240")).mock(
        return_value=httpx.Response(
            200,
            json={
                "etfKeyIndicator": {
                    "issuerName": "삼성자산운용",
                    "marketValue": "5,000억",
                    "nav": "10,250.30",
                    "totalNav": "1조 200억",
                    "deviationRate": "0.21",
                    "deviationSign": "-",
                    "totalFee": "0.39%",
                    "dividendYieldTtm": "1.50%",
                    "returnRate1m": "3.20",
                    "returnRate3m": "-1.10",
                    "returnRate1y": "15.40",
                }
            },
        )
    )
    data = naver_client.fetch_etf_fundamentals("487240")
    assert data["issuer_name"] == "삼성자산운용"
    assert data["nav"] == 10250.30
    # deviationSign '-' 이 괴리율 부호로 반영
    assert data["deviation_rate"] == -0.21
    assert data["return_3m"] == -1.10
    assert data["total_nav"] == "1조 200억"


@respx.mock
def test_fetch_etf_holdings_parses_top10():
    respx.get(_etf_analysis_url("487240")).mock(
        return_value=httpx.Response(
            200,
            json={
                "etfTop10MajorConstituentAssets": [
                    {"seq": 1, "itemCode": "005930", "itemName": "삼성전자", "etfWeight": "24.5"},
                    {"seq": 2, "itemCode": "000660", "itemName": "SK하이닉스", "etfWeight": "18.3%"},
                ]
            },
        )
    )
    rows = naver_client.fetch_etf_holdings("487240")
    assert len(rows) == 2
    assert rows[0] == {"seq": 1, "item_code": "005930", "item_name": "삼성전자", "weight": 24.5}
    assert rows[1]["weight"] == 18.3


# --- collectors: 수집·저장(멱등 upsert) ---------------------------------------

@respx.mock
def test_collect_stock_fundamentals_upserts():
    seed_stock("005930", "삼성전자", "STOCK")
    respx.get(_integration_url("005930")).mock(
        return_value=httpx.Response(
            200, json={"totalInfos": [{"code": "per", "value": "20.93배"}]}
        )
    )
    assert collectors.collect_stock_fundamentals("005930") == 1
    # 재수집해도 행이 늘지 않고 값만 갱신(멱등)
    assert collectors.collect_stock_fundamentals("005930") == 1
    with get_connection() as conn:
        n = conn.execute(
            "SELECT COUNT(*) FROM stock_fundamentals WHERE ticker='005930'"
        ).fetchone()[0]
    assert n == 1


@respx.mock
def test_collect_stock_fundamentals_missing_returns_zero():
    seed_stock("111111", "없는데이터", "STOCK")
    respx.get(_integration_url("111111")).mock(
        return_value=httpx.Response(200, json={"totalInfos": []})
    )
    assert collectors.collect_stock_fundamentals("111111") == 0


@respx.mock
def test_collect_etf_holdings_replaces_rows():
    seed_stock("487240", "KODEX ETF", "ETF")
    url = _etf_analysis_url("487240")
    # 1차: 2건
    respx.get(url).mock(
        return_value=httpx.Response(
            200,
            json={
                "etfTop10MajorConstituentAssets": [
                    {"seq": 1, "itemCode": "A", "itemName": "가", "etfWeight": "10"},
                    {"seq": 2, "itemCode": "B", "itemName": "나", "etfWeight": "5"},
                ]
            },
        )
    )
    assert collectors.collect_etf_holdings("487240") == 2
    # 2차: 1건으로 축소 → 이전 행이 남지 않고 교체되어야 함
    respx.get(url).mock(
        return_value=httpx.Response(
            200,
            json={
                "etfTop10MajorConstituentAssets": [
                    {"seq": 1, "itemCode": "A", "itemName": "가", "etfWeight": "12"},
                ]
            },
        )
    )
    assert collectors.collect_etf_holdings("487240") == 1
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT seq, weight FROM etf_holdings WHERE ticker='487240' ORDER BY seq"
        ).fetchall()
    assert [tuple(r) for r in rows] == [(1, 12.0)]


@respx.mock
def test_collect_stock_branches_etf_to_holdings():
    """collect_stock은 종목 type=ETF면 ETF 펀더멘털+구성종목을 수집한다."""
    seed_stock("487240", "KODEX ETF", "ETF")
    respx.get(_integration_url("487240")).mock(
        return_value=httpx.Response(
            200,
            json={"etfKeyIndicator": {"issuerName": "운용사", "nav": "10,000"}},
        )
    )
    respx.get(_etf_analysis_url("487240")).mock(
        return_value=httpx.Response(
            200,
            json={
                "etfTop10MajorConstituentAssets": [
                    {"seq": 1, "itemCode": "A", "itemName": "가", "etfWeight": "10"},
                ]
            },
        )
    )
    # 시세/매매동향/분봉은 이 테스트에서 관심 밖이라 빈 응답으로 모킹
    respx.get(url__regex=r".*/price").mock(return_value=httpx.Response(200, json=[]))
    respx.get(url__regex=r".*/trend").mock(return_value=httpx.Response(200, json={}))
    respx.route(url__regex=r".*/minute").mock(return_value=httpx.Response(200, json={}))

    result = collectors.collect_stock("487240")
    assert result.fundamentals == 1
    assert result.holdings == 1


# --- repository + 엔드포인트 --------------------------------------------------

@respx.mock
def test_get_fundamentals_stock_shape():
    seed_stock("005930", "삼성전자", "STOCK")
    respx.get(_integration_url("005930")).mock(
        return_value=httpx.Response(
            200, json={"totalInfos": [{"code": "per", "value": "20.93배"}]}
        )
    )
    collectors.collect_stock_fundamentals("005930")
    data = repository.get_fundamentals("005930")
    assert data["type"] == "STOCK"
    assert data["stock"]["per"] == 20.93


def test_get_fundamentals_unknown_ticker_returns_none():
    assert repository.get_fundamentals("999999") is None


def test_fundamentals_endpoint_404_for_unknown():
    r = client.get("/api/etfs/999999/fundamentals")
    assert r.status_code == 404


def test_fundamentals_endpoint_empty_payload_when_not_collected():
    seed_stock("005930", "삼성전자", "STOCK")
    r = client.get("/api/etfs/005930/fundamentals")
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "STOCK"
    assert body["stock"] is None  # 아직 수집 전 → 빈 카드


def test_fundamentals_holdings_fill_daily_change_from_catalog():
    """구성종목 전일대비는 코드로 stock_catalog 등락률을 조회해 채운다.
    코드가 없는 구성종목(해외자산·선물)은 조회 불가라 None으로 남는다.
    """
    seed_stock("487240", "KODEX AI일렉트릭", "ETF")
    with get_connection() as conn:
        # 구성종목 2건: 코드 있는 것 + 코드 없는 것
        conn.execute("INSERT INTO etf_holdings (ticker, seq, item_code, item_name, weight) "
                     "VALUES ('487240', 1, '010120', 'LS ELECTRIC', 20.49)")
        conn.execute("INSERT INTO etf_holdings (ticker, seq, item_code, item_name, weight) "
                     "VALUES ('487240', 2, '', 'United States OIL ETF', NULL)")
        # 발굴 스냅샷에 코드 있는 종목의 등락률
        conn.execute("INSERT INTO stock_catalog (ticker, name, type, market, daily_change_pct) "
                     "VALUES ('010120', 'LS ELECTRIC', 'STOCK', 'KOSPI', 9.13)")

    holdings = client.get("/api/etfs/487240/fundamentals").json()["holdings"]
    by_seq = {h["seq"]: h for h in holdings}
    assert by_seq[1]["daily_change_pct"] == 9.13   # 코드로 등락률 채워짐
    assert by_seq[1]["weight"] == 20.49
    assert by_seq[2]["daily_change_pct"] is None    # 코드 없으면 채울 수 없음
    assert by_seq[2]["weight"] is None
