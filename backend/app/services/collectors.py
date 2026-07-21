"""
Collectors: fetch from the Naver mobile API and upsert into SQLite.

Each collector returns the number of rows written so callers can report
progress. All writes are idempotent upserts keyed on (ticker, date/datetime).
"""
from __future__ import annotations

import logging

from app.config import PRICE_PAGES, TRADING_FLOW_PAGES
from app.database import get_connection
from app.models import CollectResult
from app.services import naver_client

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


def collect_stock(ticker: str) -> CollectResult:
    """Collect all three datasets for a single ticker."""
    result = CollectResult(ticker=ticker)
    try:
        result.prices = collect_prices(ticker)
        result.trading_flow = collect_trading_flow(ticker)
        result.intraday = collect_intraday(ticker)
    except Exception as exc:  # noqa: BLE001 - report per-ticker, keep going
        logger.error("collect_stock(%s) failed: %s", ticker, exc, exc_info=True)
        result.ok = False
        result.error = str(exc)
    return result
