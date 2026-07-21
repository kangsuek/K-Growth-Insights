"""Read-side queries against SQLite for the API layer."""
from __future__ import annotations

from app.database import get_connection


def list_stocks() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT ticker, name, type, theme FROM stocks ORDER BY type, name"
        ).fetchall()
    return [dict(r) for r in rows]


def list_stocks_summary() -> list[dict]:
    """종목 목록 + 각 종목의 최신 종가·등락률을 한 번의 쿼리로 조회.

    대시보드가 종목마다 개별 가격 요청(N+1)을 하지 않도록 한다.
    """
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT s.ticker, s.name, s.type, s.theme,
                   p.close_price, p.change_pct, p.date
            FROM stocks s
            LEFT JOIN prices p
              ON p.ticker = s.ticker
             AND p.date = (SELECT MAX(date) FROM prices WHERE ticker = s.ticker)
            ORDER BY s.type, s.name
            """
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


def get_fundamentals(ticker: str) -> dict | None:
    """종목 유형(STOCK/ETF)에 따라 펀더멘털을 조회해 통합 응답으로 반환.

    종목이 없으면 None. 펀더멘털이 아직 수집되지 않았으면 stock/etf가 None인
    응답을 반환한다(빈 카드 표시용).
    """
    stock = get_stock(ticker)
    if not stock:
        return None
    type_ = stock.get("type", "STOCK")
    with get_connection() as conn:
        if type_ == "ETF":
            row = conn.execute(
                """
                SELECT issuer_name, market_value, nav, total_nav, deviation_rate,
                       total_fee, dividend_yield, return_1m, return_3m, return_1y,
                       updated_at
                FROM etf_fundamentals WHERE ticker = ?
                """,
                (ticker,),
            ).fetchone()
            holdings = conn.execute(
                """
                SELECT seq, item_code, item_name, weight
                FROM etf_holdings WHERE ticker = ? ORDER BY seq
                """,
                (ticker,),
            ).fetchall()
            return {
                "ticker": ticker,
                "type": "ETF",
                "etf": dict(row) if row else None,
                "holdings": [dict(h) for h in holdings],
            }

        row = conn.execute(
            """
            SELECT per, pbr, eps, bps, est_per, est_eps, dividend_yield,
                   dividend, foreign_rate, high_52w, low_52w, market_value,
                   updated_at
            FROM stock_fundamentals WHERE ticker = ?
            """,
            (ticker,),
        ).fetchone()
        return {
            "ticker": ticker,
            "type": "STOCK",
            "stock": dict(row) if row else None,
        }


def get_news(ticker: str, limit: int = 10) -> list[dict]:
    """종목 뉴스를 최신순으로 조회."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT title, link, description, pub_date
            FROM news WHERE ticker = ?
            ORDER BY pub_date DESC LIMIT ?
            """,
            (ticker, limit),
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
            "news": count("news"),
        }
