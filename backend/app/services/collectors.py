"""
Collectors: fetch from the Naver mobile API and upsert into SQLite.

Each collector returns the number of rows written so callers can report
progress. All writes are idempotent upserts keyed on (ticker, date/datetime).
"""
from __future__ import annotations

import logging

from app import config
from app.config import PRICE_PAGES, TRADING_FLOW_PAGES
from app.database import get_connection
from app.models import CollectResult
from app.services import naver_client, repository

logger = logging.getLogger(__name__)


def collect_prices(ticker: str, pages: int = PRICE_PAGES) -> int:
    rows = naver_client.fetch_daily_prices(ticker, pages=pages)
    if not rows:
        return 0
    with get_connection() as conn:
        conn.executemany(
            """
            INSERT INTO prices
                (ticker, date, open_price, high_price, low_price,
                 close_price, volume, change_pct)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticker, date) DO UPDATE SET
                open_price=excluded.open_price,
                high_price=excluded.high_price,
                low_price=excluded.low_price,
                close_price=excluded.close_price,
                volume=excluded.volume,
                change_pct=excluded.change_pct
            """,
            [
                (
                    ticker, r["date"], r["open_price"], r["high_price"],
                    r["low_price"], r["close_price"], r["volume"], r["change_pct"],
                )
                for r in rows
                if r.get("date")
            ],
        )
    return len(rows)


def collect_trading_flow(ticker: str, pages: int = TRADING_FLOW_PAGES) -> int:
    rows = naver_client.fetch_trading_flow(ticker, pages=pages)
    if not rows:
        return 0
    with get_connection() as conn:
        conn.executemany(
            """
            INSERT INTO trading_flow
                (ticker, date, individual_net, institutional_net,
                 foreign_net, foreign_hold_ratio)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticker, date) DO UPDATE SET
                individual_net=excluded.individual_net,
                institutional_net=excluded.institutional_net,
                foreign_net=excluded.foreign_net,
                foreign_hold_ratio=excluded.foreign_hold_ratio
            """,
            [
                (
                    ticker, r["date"], r["individual_net"],
                    r["institutional_net"], r["foreign_net"],
                    r["foreign_hold_ratio"],
                )
                for r in rows
                if r.get("date")
            ],
        )
    return len(rows)


def collect_intraday(ticker: str) -> int:
    rows = naver_client.fetch_intraday(ticker)
    if not rows:
        return 0
    with get_connection() as conn:
        conn.executemany(
            """
            INSERT INTO intraday_prices
                (ticker, datetime, open_price, high_price, low_price,
                 price, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticker, datetime) DO UPDATE SET
                open_price=excluded.open_price,
                high_price=excluded.high_price,
                low_price=excluded.low_price,
                price=excluded.price,
                volume=excluded.volume
            """,
            [
                (
                    ticker, r["datetime"], r["open_price"], r["high_price"],
                    r["low_price"], r["price"], r["volume"],
                )
                for r in rows
                if r.get("datetime")
            ],
        )
    return len(rows)


def collect_stock_fundamentals(ticker: str) -> int:
    data = naver_client.fetch_stock_fundamentals(ticker)
    if not data:
        return 0
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO stock_fundamentals
                (ticker, per, pbr, eps, bps, est_per, est_eps,
                 dividend_yield, dividend, foreign_rate, high_52w, low_52w,
                 market_value, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(ticker) DO UPDATE SET
                per=excluded.per, pbr=excluded.pbr, eps=excluded.eps,
                bps=excluded.bps, est_per=excluded.est_per,
                est_eps=excluded.est_eps, dividend_yield=excluded.dividend_yield,
                dividend=excluded.dividend, foreign_rate=excluded.foreign_rate,
                high_52w=excluded.high_52w, low_52w=excluded.low_52w,
                market_value=excluded.market_value, updated_at=excluded.updated_at
            """,
            (
                ticker, data["per"], data["pbr"], data["eps"], data["bps"],
                data["est_per"], data["est_eps"], data["dividend_yield"],
                data["dividend"], data["foreign_rate"], data["high_52w"],
                data["low_52w"], data["market_value"],
            ),
        )
    return 1


def collect_etf_fundamentals(ticker: str) -> int:
    data = naver_client.fetch_etf_fundamentals(ticker)
    if not data:
        return 0
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO etf_fundamentals
                (ticker, issuer_name, market_value, nav, total_nav,
                 deviation_rate, total_fee, dividend_yield,
                 return_1m, return_3m, return_1y, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(ticker) DO UPDATE SET
                issuer_name=excluded.issuer_name,
                market_value=excluded.market_value, nav=excluded.nav,
                total_nav=excluded.total_nav,
                deviation_rate=excluded.deviation_rate,
                total_fee=excluded.total_fee,
                dividend_yield=excluded.dividend_yield,
                return_1m=excluded.return_1m, return_3m=excluded.return_3m,
                return_1y=excluded.return_1y, updated_at=excluded.updated_at
            """,
            (
                ticker, data["issuer_name"], data["market_value"], data["nav"],
                data["total_nav"], data["deviation_rate"], data["total_fee"],
                data["dividend_yield"], data["return_1m"], data["return_3m"],
                data["return_1y"],
            ),
        )
    return 1


def collect_etf_holdings(ticker: str) -> int:
    rows = naver_client.fetch_etf_holdings(ticker)
    if not rows:
        return 0
    with get_connection() as conn:
        # 구성종목은 순위·편입이 바뀌므로 전체 삭제 후 재삽입한다.
        conn.execute("DELETE FROM etf_holdings WHERE ticker = ?", (ticker,))
        conn.executemany(
            """
            INSERT INTO etf_holdings
                (ticker, seq, item_code, item_name, weight, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            """,
            [
                (ticker, r["seq"], r["item_code"], r["item_name"], r["weight"])
                for r in rows
                if r.get("seq") is not None
            ],
        )
    return len(rows)


def collect_news(ticker: str) -> int:
    """종목명으로 네이버 검색 API 뉴스를 수집해 upsert. 키 미설정 시 0.

    link를 종목 내 고유키로 삼아 재수집 시 중복 없이 최신 제목/요약을 갱신한다.
    """
    if not config.naver_search_enabled():
        return 0
    stock = repository.get_stock(ticker)
    if not stock:
        return 0
    rows = naver_client.fetch_news(stock["name"], display=config.NEWS_DISPLAY)
    if not rows:
        return 0
    with get_connection() as conn:
        conn.executemany(
            """
            INSERT INTO news (ticker, title, link, description, pub_date, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(ticker, link) DO UPDATE SET
                title=excluded.title, description=excluded.description,
                pub_date=excluded.pub_date, updated_at=excluded.updated_at
            """,
            [
                (ticker, r["title"], r["link"], r["description"], r["pub_date"])
                for r in rows
                if r.get("title") and r.get("link")
            ],
        )
    return len(rows)


def collect_stock(ticker: str) -> CollectResult:
    """Collect all datasets for a single ticker (STOCK/ETF에 따라 펀더멘털 분기)."""
    result = CollectResult(ticker=ticker)
    try:
        result.prices = collect_prices(ticker)
        result.trading_flow = collect_trading_flow(ticker)
        result.intraday = collect_intraday(ticker)

        # 이미 동기화된 stocks.type으로 주식/ETF 펀더멘털을 분기 수집한다.
        stock = repository.get_stock(ticker)
        if stock and stock.get("type") == "ETF":
            result.fundamentals = collect_etf_fundamentals(ticker)
            result.holdings = collect_etf_holdings(ticker)
        else:
            result.fundamentals = collect_stock_fundamentals(ticker)

        # 검색 API 키가 설정된 경우에만 뉴스 수집(그레이스풀).
        result.news = collect_news(ticker)
    except Exception as exc:  # noqa: BLE001 - report per-ticker, keep going
        logger.error("collect_stock(%s) failed: %s", ticker, exc, exc_info=True)
        result.ok = False
        result.error = str(exc)
    return result
