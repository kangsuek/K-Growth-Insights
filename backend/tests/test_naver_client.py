"""Unit tests for Naver mobile API response normalization (no network)."""
import httpx
import pytest
import respx

from app.services import naver_client as nc


def test_to_int_handles_naver_formats():
    assert nc._to_int("+1,129,083") == 1129083
    assert nc._to_int("-826,076") == -826076
    assert nc._to_int("1,877,021") == 1877021
    assert nc._to_int(61018) == 61018
    assert nc._to_int("") is None
    assert nc._to_int("-") is None
    assert nc._to_int(None) is None


def test_to_float_handles_percent_and_sign():
    assert nc._to_float("6.56") == 6.56
    assert nc._to_float("+6.56") == 6.56
    assert nc._to_float("46.59%") == 46.59
    assert nc._to_float("") is None
    assert nc._to_float(None) is None


def test_num_extracts_leading_number_from_units():
    # 단위·통화·% 가 붙은 펀더멘털 문자열에서 앞쪽 숫자만 추출
    assert nc._num("20.93배") == 20.93
    assert nc._num("12,372원") == 12372.0
    assert nc._num("46.59%") == 46.59
    assert nc._num("31,971.60") == 31971.6
    assert nc._num(-0.21) == -0.21
    assert nc._num("-31.36") == -31.36
    assert nc._num("") is None
    assert nc._num(None) is None


def test_date_normalizers():
    assert nc._bizdate_to_iso("20260721") == "2026-07-21"
    assert nc._localdatetime_to_iso("20260721090000") == "2026-07-21T09:00:00"
    assert nc._localdatetime_to_iso("20260721153000") == "2026-07-21T15:30:00"


def _catalog_page(codes):
    return {
        "stocks": [
            {"itemCode": c, "stockName": f"종목{c}", "stockEndType": t}
            for c, t in codes
        ]
    }


@respx.mock
def test_fetch_market_catalog_paginates_and_normalizes():
    route = respx.get(f"{nc.MSTOCKS_BASE}/marketValue/KOSPI")
    # 페이지1은 60건(가득), 페이지2는 나머지 → limit까지 페이지네이션
    page1 = [(f"{i:06d}", "stock") for i in range(60)]
    page2 = [("900001", "etf"), ("900002", "stock")]
    route.side_effect = [
        httpx.Response(200, json=_catalog_page(page1)),
        httpx.Response(200, json=_catalog_page(page2)),
    ]

    rows = nc.fetch_market_catalog("KOSPI", limit=62)

    assert len(rows) == 62
    assert route.call_count == 2  # 두 페이지 요청
    assert rows[0] == {"ticker": "000000", "name": "종목000000", "type": "STOCK", "exchange": "KOSPI"}
    assert rows[60]["type"] == "ETF"  # stockEndType 'etf' → 'ETF'


@respx.mock
def test_fetch_market_catalog_stops_on_empty_page():
    route = respx.get(f"{nc.MSTOCKS_BASE}/marketValue/KOSDAQ")
    route.side_effect = [
        httpx.Response(200, json=_catalog_page([("111111", "stock")])),
        httpx.Response(200, json={"stocks": []}),
    ]

    rows = nc.fetch_market_catalog("KOSDAQ", limit=100)

    assert [r["ticker"] for r in rows] == ["111111"]


def test_fetch_market_catalog_rejects_unknown_market():
    with pytest.raises(ValueError):
        nc.fetch_market_catalog("NASDAQ", limit=1)


@respx.mock
def test_fetch_intraday_returns_current_session_when_available():
    respx.get(f"{nc.CHART_BASE}/005930/minute").mock(
        return_value=httpx.Response(
            200,
            json=[{"localDateTime": "20260722090000", "currentPrice": 100.0}],
        )
    )
    rows = nc.fetch_intraday("005930")
    assert len(rows) == 1
    assert rows[0]["datetime"] == "2026-07-22T09:00:00"


@respx.mock
def test_fetch_intraday_falls_back_to_previous_trading_day():
    # 1차 /minute(당일)는 빈 응답 → 일별시세로 최근 거래일 확인 → 그 날짜로 재요청
    minute = respx.get(f"{nc.CHART_BASE}/005930/minute")
    minute.side_effect = [
        httpx.Response(200, json=[]),  # 당일 세션 비어 있음
        httpx.Response(
            200,
            json=[
                {"localDateTime": "20260721090000", "currentPrice": 245500.0},
                {"localDateTime": "20260721153000", "currentPrice": 259000.0},
            ],
        ),
    ]
    respx.get(f"{nc.MSTOCK_BASE}/005930/price").mock(
        return_value=httpx.Response(
            200, json=[{"localTradedAt": "2026-07-21", "closePrice": "259,000"}]
        )
    )

    rows = nc.fetch_intraday("005930")

    assert len(rows) == 2
    assert rows[0]["datetime"] == "2026-07-21T09:00:00"
    assert rows[-1]["price"] == 259000.0
    # 폴백 재요청 시 직전 거래일 구간 파라미터가 전달되었는지 확인
    fallback_req = minute.calls[1].request
    assert "startDateTime=202607210900" in str(fallback_req.url)
    assert "endDateTime=202607211600" in str(fallback_req.url)


@respx.mock
def test_fetch_intraday_empty_when_no_trading_date():
    respx.get(f"{nc.CHART_BASE}/005930/minute").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.get(f"{nc.MSTOCK_BASE}/005930/price").mock(
        return_value=httpx.Response(200, json=[])
    )
    assert nc.fetch_intraday("005930") == []
