"""collectors 파싱→저장 테스트: 시세·매매동향·분봉 (respx 모킹 + 임시 DB)."""
import httpx
import respx

from app.database import get_connection
from app.services import collectors, naver_client
from tests.conftest import seed_stock


@respx.mock
def test_collect_prices_parses_and_upserts():
    seed_stock("005930", "삼성전자", "STOCK")
    respx.get(f"{naver_client.MSTOCK_BASE}/005930/price").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "localTradedAt": "2026-07-21",
                    "openPrice": "249,000",
                    "highPrice": "264,000",
                    "lowPrice": "243,000",
                    "closePrice": "259,000",
                    "accumulatedTradingVolume": "36,669,691",
                    "fluctuationsRatio": "6.15",
                }
            ],
        )
    )
    assert collectors.collect_prices("005930") == 1
    with get_connection() as conn:
        row = conn.execute(
            "SELECT close_price, volume, change_pct FROM prices WHERE ticker='005930'"
        ).fetchone()
    assert row["close_price"] == 259000.0
    assert row["volume"] == 36669691
    assert row["change_pct"] == 6.15


@respx.mock
def test_collect_prices_idempotent_on_same_date():
    seed_stock("005930", "삼성전자", "STOCK")
    body = [
        {
            "localTradedAt": "2026-07-21",
            "openPrice": "249,000",
            "highPrice": "264,000",
            "lowPrice": "243,000",
            "closePrice": "259,000",
            "accumulatedTradingVolume": "36,669,691",
            "fluctuationsRatio": "6.15",
        }
    ]
    route = respx.get(f"{naver_client.MSTOCK_BASE}/005930/price")
    route.mock(return_value=httpx.Response(200, json=body))
    collectors.collect_prices("005930")
    collectors.collect_prices("005930")  # 재수집
    with get_connection() as conn:
        n = conn.execute("SELECT COUNT(*) FROM prices WHERE ticker='005930'").fetchone()[0]
    assert n == 1  # (ticker,date) upsert라 중복 없음


@respx.mock
def test_collect_trading_flow_parses_signed_values():
    seed_stock("005930", "삼성전자", "STOCK")
    respx.get(f"{naver_client.MSTOCK_BASE}/005930/trend").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "bizdate": "20260721",
                    "individualPureBuyQuant": "-3,654,326",
                    "organPureBuyQuant": "+1,823,763",
                    "foreignerPureBuyQuant": "+1,943,936",
                    "foreignerHoldRatio": "46.62",
                }
            ],
        )
    )
    assert collectors.collect_trading_flow("005930") == 1
    with get_connection() as conn:
        row = conn.execute(
            "SELECT individual_net, institutional_net, foreign_net, foreign_hold_ratio "
            "FROM trading_flow WHERE ticker='005930'"
        ).fetchone()
    assert row["individual_net"] == -3654326
    assert row["institutional_net"] == 1823763
    assert row["foreign_net"] == 1943936
    assert row["foreign_hold_ratio"] == 46.62


@respx.mock
def test_collect_intraday_parses_bars():
    seed_stock("005930", "삼성전자", "STOCK")
    respx.get(f"{naver_client.CHART_BASE}/005930/minute").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "localDateTime": "20260721090000",
                    "openPrice": 247000.0,
                    "highPrice": 249000.0,
                    "lowPrice": 245500.0,
                    "currentPrice": 245500.0,
                    "accumulatedTradingVolume": 672329,
                },
                {
                    "localDateTime": "20260721153000",
                    "openPrice": 258000.0,
                    "highPrice": 259000.0,
                    "lowPrice": 258000.0,
                    "currentPrice": 259000.0,
                    "accumulatedTradingVolume": 100000,
                },
            ],
        )
    )
    assert collectors.collect_intraday("005930") == 2
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT datetime, price, volume FROM intraday_prices "
            "WHERE ticker='005930' ORDER BY datetime"
        ).fetchall()
    assert rows[0]["datetime"] == "2026-07-21T09:00:00"
    assert rows[0]["price"] == 245500.0
    assert rows[-1]["price"] == 259000.0


@respx.mock
def test_collect_prices_empty_returns_zero():
    seed_stock("005930", "삼성전자", "STOCK")
    respx.get(f"{naver_client.MSTOCK_BASE}/005930/price").mock(
        return_value=httpx.Response(200, json=[])
    )
    assert collectors.collect_prices("005930") == 0
