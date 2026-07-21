"""Read-side queries against SQLite for the API layer."""
from __future__ import annotations

from app.database import get_connection


def list_stocks() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT ticker, name, type, theme FROM stocks ORDER BY type, name"
        ).fetchall()
    return [dict(r) for r in rows]


def get_stock(ticker: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT ticker, name, type, theme FROM stocks WHERE ticker = ?",
            (ticker,),
        ).fetchone()
    return dict(row) if row else None


def get_prices(ticker: str, days: int = 60) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT date, open_price, high_price, low_price, close_price,
                   volume, change_pct
            FROM prices WHERE ticker = ?
            ORDER BY date DESC LIMIT ?
            """,
            (ticker, days),
        ).fetchall()
    # Return chronological (oldest first) for charting.
    return [dict(r) for r in reversed(rows)]


def get_trading_flow(ticker: str, days: int = 20) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT date, individual_net, institutional_net, foreign_net,
                   foreign_hold_ratio
            FROM trading_flow WHERE ticker = ?
            ORDER BY date DESC LIMIT ?
            """,
            (ticker, days),
        ).fetchall()
    return [dict(r) for r in reversed(rows)]


def get_intraday(ticker: str) -> list[dict]:
    """Return the most recent trading day's minute bars, chronological."""
    with get_connection() as conn:
        latest = conn.execute(
            "SELECT MAX(substr(datetime, 1, 10)) AS d FROM intraday_prices "
            "WHERE ticker = ?",
            (ticker,),
        ).fetchone()
        if not latest or not latest["d"]:
            return []
        rows = conn.execute(
            """
            SELECT datetime, open_price, high_price, low_price, price, volume
            FROM intraday_prices
            WHERE ticker = ? AND substr(datetime, 1, 10) = ?
            ORDER BY datetime ASC
            """,
            (ticker, latest["d"]),
        ).fetchall()
    return [dict(r) for r in rows]


def data_stats() -> dict:
    with get_connection() as conn:
        def count(table: str) -> int:
            return conn.execute(f"SELECT COUNT(*) AS c FROM {table}").fetchone()["c"]

        return {
            "stocks": count("stocks"),
            "prices": count("prices"),
            "trading_flow": count("trading_flow"),
            "intraday_prices": count("intraday_prices"),
        }
