"""Read-side queries against SQLite for the API layer."""
from __future__ import annotations

import json

from app import timeutil
from app.database import get_connection

# 사용자 지정 정렬(sort_order) 우선, 없으면 종목명. 대시보드·목록 공통 순서.
_ORDER_BY = "ORDER BY sort_order IS NULL, sort_order, name"


def list_stocks() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT ticker, name, type, theme FROM stocks {_ORDER_BY}"
        ).fetchall()
    return [dict(r) for r in rows]


def _stock_full(row) -> dict:
    """stocks 전체 컬럼 행 → 설정 화면용 dict(relevance_keywords는 JSON 파싱)."""
    d = dict(row)
    rk = d.get("relevance_keywords")
    if rk:
        try:
            d["relevance_keywords"] = json.loads(rk)
        except (TypeError, ValueError):
            d["relevance_keywords"] = None
    return d


_FULL_COLS = (
    "ticker, name, type, theme, purchase_date, purchase_price, quantity, "
    "search_keyword, relevance_keywords"
)


def list_stocks_full() -> list[dict]:
    """설정 화면용 전체 종목(구매정보·키워드 포함), 사용자 지정 순서."""
    with get_connection() as conn:
        rows = conn.execute(f"SELECT {_FULL_COLS} FROM stocks {_ORDER_BY}").fetchall()
    return [_stock_full(r) for r in rows]


def create_stock(data: dict) -> dict:
    """종목 추가. 중복이면 ValueError."""
    ticker = data["ticker"]
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM stocks WHERE ticker = ?", (ticker,)).fetchone()
        if exists:
            raise ValueError(f"이미 존재하는 종목입니다: {ticker}")
        rk = data.get("relevance_keywords")
        # 신규 종목은 목록 맨 뒤로(최대 sort_order + 1).
        max_order = conn.execute("SELECT MAX(sort_order) AS m FROM stocks").fetchone()["m"]
        conn.execute(
            """
            INSERT INTO stocks (ticker, name, type, theme, purchase_date,
                purchase_price, quantity, search_keyword, relevance_keywords,
                sort_order, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                ticker, data.get("name") or ticker, data.get("type", "STOCK"),
                data.get("theme"), data.get("purchase_date"), data.get("purchase_price"),
                data.get("quantity"), data.get("search_keyword"),
                json.dumps(rk, ensure_ascii=False) if rk else None,
                (max_order or 0) + 1,
            ),
        )
    return get_stock_full(ticker)


def update_stock(ticker: str, data: dict) -> dict | None:
    """부분 업데이트. 제공된 필드만 갱신. 종목 없으면 None."""
    with get_connection() as conn:
        if not conn.execute("SELECT 1 FROM stocks WHERE ticker = ?", (ticker,)).fetchone():
            return None
        fields, values = [], []
        for col in ("name", "type", "theme", "purchase_date", "purchase_price",
                    "quantity", "search_keyword"):
            if col in data and data[col] is not None:
                fields.append(f"{col} = ?")
                values.append(data[col])
        if "relevance_keywords" in data and data["relevance_keywords"] is not None:
            fields.append("relevance_keywords = ?")
            values.append(json.dumps(data["relevance_keywords"], ensure_ascii=False))
        if fields:
            fields.append("updated_at = datetime('now')")
            conn.execute(f"UPDATE stocks SET {', '.join(fields)} WHERE ticker = ?",
                         (*values, ticker))
    return get_stock_full(ticker)


def get_stock_full(ticker: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT {_FULL_COLS} FROM stocks WHERE ticker = ?", (ticker,)
        ).fetchone()
    return _stock_full(row) if row else None


def delete_stock(ticker: str) -> dict:
    """종목 + 관련 수집 데이터 전체 삭제(cascade). 삭제 건수 반환."""
    tables = ["prices", "trading_flow", "intraday_prices", "news",
              "stock_fundamentals", "etf_fundamentals", "etf_holdings"]
    deleted: dict[str, int] = {}
    with get_connection() as conn:
        for t in tables:
            cur = conn.execute(f"DELETE FROM {t} WHERE ticker = ?", (ticker,))
            deleted[t] = cur.rowcount
        conn.execute("DELETE FROM stocks WHERE ticker = ?", (ticker,))
    return deleted


def reorder_stocks(tickers: list[str]) -> int:
    """주어진 순서대로 sort_order를 부여. 반영 건수 반환."""
    with get_connection() as conn:
        for i, ticker in enumerate(tickers):
            conn.execute("UPDATE stocks SET sort_order = ? WHERE ticker = ?", (i, ticker))
    return len(tickers)


def search_catalog(query: str, stock_type: str | None = None, limit: int = 20) -> list[dict]:
    """종목 발굴 카탈로그(stock_catalog)를 티커·종목명으로 검색(워치리스트 추가 자동완성용)."""
    like = f"%{query}%"
    sql = (
        "SELECT ticker, name, type, market FROM stock_catalog "
        "WHERE (ticker LIKE ? OR name LIKE ?)"
    )
    params: list = [like, like]
    if stock_type:
        sql += " AND type = ?"
        params.append(stock_type)
    # 정확한 티커 일치를 우선.
    sql += " ORDER BY (ticker = ?) DESC, name LIMIT ?"
    params.extend([query, limit])
    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [{"ticker": r["ticker"], "name": r["name"], "type": r["type"],
             "market": r["market"], "sector": None} for r in rows]


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


def prices_earliest_date(ticker: str) -> str | None:
    """종목 일별시세의 가장 이른 날짜(YYYY-MM-DD). 데이터 없으면 None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT MIN(date) AS d FROM prices WHERE ticker = ?", (ticker,)
        ).fetchone()
    return row["d"] if row and row["d"] else None


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


def get_prices_range(ticker: str, start: str | None, end: str | None) -> list[dict]:
    """기간(start~end)으로 시세 조회(오래된→최신). 상세 차트의 날짜 범위용."""
    where = ["ticker = ?"]
    params: list = [ticker]
    if start:
        where.append("date >= ?")
        params.append(start)
    if end:
        where.append("date <= ?")
        params.append(end)
    with get_connection() as conn:
        rows = conn.execute(
            f"""SELECT date, open_price, high_price, low_price, close_price,
                       volume, change_pct
                FROM prices WHERE {' AND '.join(where)} ORDER BY date""",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


def get_trading_flow_range(ticker: str, start: str | None, end: str | None) -> list[dict]:
    """기간으로 매매동향 조회(오래된→최신)."""
    where = ["ticker = ?"]
    params: list = [ticker]
    if start:
        where.append("date >= ?")
        params.append(start)
    if end:
        where.append("date <= ?")
        params.append(end)
    with get_connection() as conn:
        rows = conn.execute(
            f"""SELECT date, individual_net, institutional_net, foreign_net,
                       foreign_hold_ratio
                FROM trading_flow WHERE {' AND '.join(where)} ORDER BY date""",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


def trading_flow_earliest_date(ticker: str) -> str | None:
    """종목 매매동향의 가장 이른 날짜(YYYY-MM-DD). 데이터 없으면 None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT MIN(date) AS d FROM trading_flow WHERE ticker = ?", (ticker,)
        ).fetchone()
    return row["d"] if row and row["d"] else None


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


def get_intraday_dated(
    ticker: str, target_date: str | None = None
) -> tuple[str | None, list[dict]]:
    """분봉을 (실제날짜, 행목록)로 반환. 시간순 정렬.

    target_date(YYYY-MM-DD)가 주어지면 그 날짜만 조회한다. 없으면 가장 최근
    거래일로 폴백하므로, 당일 분봉이 아직 없을 때 자연히 직전 거래일 데이터를
    돌려준다. 실제 반환한 날짜를 함께 주어 화면에 표기할 수 있게 한다.
    """
    with get_connection() as conn:
        if target_date:
            day = target_date
        else:
            latest = conn.execute(
                "SELECT MAX(substr(datetime, 1, 10)) AS d FROM intraday_prices "
                "WHERE ticker = ?",
                (ticker,),
            ).fetchone()
            day = latest["d"] if latest else None
        if not day:
            return None, []
        rows = conn.execute(
            """
            SELECT datetime, open_price, high_price, low_price, price, volume
            FROM intraday_prices
            WHERE ticker = ? AND substr(datetime, 1, 10) = ?
            ORDER BY datetime ASC
            """,
            (ticker, day),
        ).fetchall()
    return day, [dict(r) for r in rows]


def get_intraday(ticker: str) -> list[dict]:
    """Return the most recent trading day's minute bars, chronological."""
    _, rows = get_intraday_dated(ticker)
    return rows


def close_before(ticker: str, date: str) -> float | None:
    """주어진 날짜 직전 거래일의 종가(전일 종가). 분봉 전일비 계산용."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT close_price FROM prices
            WHERE ticker = ? AND date < ?
            ORDER BY date DESC LIMIT 1
            """,
            (ticker, date),
        ).fetchone()
    return row["close_price"] if row else None


def latest_change_pct(codes: list[str]) -> dict[str, float]:
    """여러 종목코드의 최근 등락률(%) 조회. {code: pct}.

    발굴 스냅샷(stock_catalog.daily_change_pct)을 우선 쓰고, 없으면 최신
    일별시세(prices.change_pct)로 보완한다. ETF 구성종목 전일대비 표시에 사용.
    """
    codes = [c for c in dict.fromkeys(codes) if c]  # 중복·빈값 제거, 순서 유지
    if not codes:
        return {}
    ph = ",".join("?" * len(codes))
    result: dict[str, float] = {}
    with get_connection() as conn:
        for r in conn.execute(
            f"SELECT ticker, daily_change_pct FROM stock_catalog "
            f"WHERE ticker IN ({ph}) AND daily_change_pct IS NOT NULL", codes
        ):
            result[r["ticker"]] = r["daily_change_pct"]
        missing = [c for c in codes if c not in result]
        if missing:
            ph2 = ",".join("?" * len(missing))
            # 각 종목의 가장 최근 거래일 등락률.
            for r in conn.execute(
                f"""SELECT p.ticker, p.change_pct FROM prices p
                    JOIN (SELECT ticker, MAX(date) AS d FROM prices
                          WHERE ticker IN ({ph2}) GROUP BY ticker) m
                      ON p.ticker = m.ticker AND p.date = m.d""", missing
            ):
                if r["change_pct"] is not None:
                    result[r["ticker"]] = r["change_pct"]
    return result


def _with_kst_updated_at(row) -> dict | None:
    """펀더멘털 행의 updated_at(UTC)을 표시용 KST ISO로 바꿔 반환."""
    if row is None:
        return None
    data = dict(row)
    if "updated_at" in data:
        data["updated_at"] = timeutil.to_kst_iso(data["updated_at"])
    return data


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
                "etf": _with_kst_updated_at(row),
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
            "stock": _with_kst_updated_at(row),
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


def reset_collected_data() -> dict:
    """수집 데이터 전체 삭제(stocks 목록은 보존). 테이블별 삭제 건수 반환."""
    tables = [
        "prices", "trading_flow", "intraday_prices", "news",
        "stock_fundamentals", "etf_fundamentals", "etf_holdings",
    ]
    deleted: dict[str, int] = {}
    with get_connection() as conn:
        for t in tables:
            cur = conn.execute(f"DELETE FROM {t}")
            deleted[t] = cur.rowcount
    return deleted


def last_collection_time() -> str | None:
    """가장 최근 수집 시각(KST ISO). updated_at을 가진 테이블들의 최대값. 없으면 None."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT MAX(t) AS t FROM (
                SELECT MAX(updated_at) AS t FROM news
                UNION ALL SELECT MAX(updated_at) FROM stock_fundamentals
                UNION ALL SELECT MAX(updated_at) FROM etf_fundamentals
                UNION ALL SELECT MAX(updated_at) FROM etf_holdings
            )
            """
        ).fetchone()
    return timeutil.to_kst_iso(row["t"]) if row else None


def data_stats() -> dict:
    from pathlib import Path

    from app.config import DATABASE_PATH

    with get_connection() as conn:
        def count(table: str) -> int:
            return conn.execute(f"SELECT COUNT(*) AS c FROM {table}").fetchone()["c"]

        stocks = count("stocks")           # 워치리스트(종목관리)
        result = {
            "stocks": stocks,
            "etfs": stocks,                # 프론트 '종목 수'(관찰 종목)
            "stock_catalog": count("stock_catalog"),  # 발굴 카탈로그(별개)
            "prices": count("prices"),
            "trading_flow": count("trading_flow"),
            "intraday_prices": count("intraday_prices"),
            "news": count("news"),
        }
    result["last_collection"] = last_collection_time()
    try:
        size_mb = Path(DATABASE_PATH).stat().st_size / (1024 * 1024)
        result["database_size_mb"] = round(size_mb, 2)
    except OSError:
        result["database_size_mb"] = None
    return result
