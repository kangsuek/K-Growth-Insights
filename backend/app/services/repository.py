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
        # purchase_date/purchase_price/quantity는 여기서 받지 않는다 — 거래내역
        # (services/transactions.py)이 유일한 소스이며, 매수 등록 시 채워진다.
        conn.execute(
            """
            INSERT INTO stocks (ticker, name, type, theme, search_keyword,
                relevance_keywords, sort_order, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                ticker, data.get("name") or ticker, data.get("type", "STOCK"),
                data.get("theme"), data.get("search_keyword"),
                json.dumps(rk, ensure_ascii=False) if rk else None,
                (max_order or 0) + 1,
            ),
        )
    return get_stock_full(ticker)


# name·type은 NOT NULL이므로 null을 받아도 지우지 않고 기존 값을 유지한다.
_STOCK_REQUIRED_COLS = ("name", "type")
# 선택 필드는 null을 "지우기"로 해석해 NULL을 반영한다(수정 폼에서 칸을 비운 경우).
# purchase_date/purchase_price/quantity는 여기 없다 — 거래내역(services/transactions.py)이
# 유일한 소스이며 update_stock_position()으로만 바뀐다.
_STOCK_OPTIONAL_COLS = ("theme", "search_keyword")


def update_stock(ticker: str, data: dict) -> dict | None:
    """부분 업데이트. 제공된 필드만 갱신. 종목 없으면 None.

    라우터가 exclude_unset=True로 넘기므로 "보내지 않은 필드"와 "null로 보낸 필드"가
    구분된다. 전자는 그대로 두고, 후자는 선택 필드에 한해 NULL로 지운다.
    """
    with get_connection() as conn:
        if not conn.execute("SELECT 1 FROM stocks WHERE ticker = ?", (ticker,)).fetchone():
            return None
        fields, values = [], []
        for col in _STOCK_REQUIRED_COLS:
            if col in data and data[col] is not None:
                fields.append(f"{col} = ?")
                values.append(data[col])
        for col in _STOCK_OPTIONAL_COLS:
            if col in data:
                fields.append(f"{col} = ?")
                values.append(data[col])
        if "relevance_keywords" in data:
            fields.append("relevance_keywords = ?")
            values.append(
                json.dumps(data["relevance_keywords"], ensure_ascii=False)
                if data["relevance_keywords"] is not None else None
            )
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


def get_prices_batch(tickers: list[str], days: int) -> dict[str, list[dict]]:
    """여러 종목의 최근 N거래일 시세를 한 쿼리로 조회(종목별 오래된→최신).

    get_prices()를 종목마다 반복 호출하는 대신 윈도우 함수로 한 번에 가져온다
    (batch-summary 등 다종목 배치 조회 전용).
    """
    if not tickers:
        return {}
    placeholders = ",".join("?" * len(tickers))
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT ticker, date, open_price, high_price, low_price, close_price,
                   volume, change_pct
            FROM (
                SELECT ticker, date, open_price, high_price, low_price, close_price,
                       volume, change_pct,
                       ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY date DESC) AS rn
                FROM prices WHERE ticker IN ({placeholders})
            )
            WHERE rn <= ?
            ORDER BY ticker, date
            """,
            (*tickers, days),
        ).fetchall()
    out: dict[str, list[dict]] = {t: [] for t in tickers}
    for r in rows:
        d = dict(r)
        out[d.pop("ticker")].append(d)
    return out


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


def get_trading_flow_batch(tickers: list[str], days: int) -> dict[str, list[dict]]:
    """여러 종목의 최근 N거래일 매매동향을 한 쿼리로 조회(종목별 오래된→최신)."""
    if not tickers:
        return {}
    placeholders = ",".join("?" * len(tickers))
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT ticker, date, individual_net, institutional_net, foreign_net,
                   foreign_hold_ratio
            FROM (
                SELECT ticker, date, individual_net, institutional_net, foreign_net,
                       foreign_hold_ratio,
                       ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY date DESC) AS rn
                FROM trading_flow WHERE ticker IN ({placeholders})
            )
            WHERE rn <= ?
            ORDER BY ticker, date
            """,
            (*tickers, days),
        ).fetchall()
    out: dict[str, list[dict]] = {t: [] for t in tickers}
    for r in rows:
        d = dict(r)
        out[d.pop("ticker")].append(d)
    return out


def get_intraday_dated(
    ticker: str, target_date: str | None = None
) -> tuple[str | None, list[dict]]:
    """분봉을 (실제날짜, 행목록)로 반환. 시간순 정렬.

    target_date(YYYY-MM-DD)가 주어지면 그 날짜를 우선 조회하되, 해당 날짜에
    분봉이 없으면(휴장일 등) 그 이전 가장 최근 거래일로 폴백한다. target_date가
    없으면 곧바로 가장 최근 거래일로 폴백하므로, 당일 분봉이 아직 없을 때
    자연히 직전 거래일 데이터를 돌려준다. 실제 반환한 날짜를 함께 주어 화면에
    표기할 수 있게 한다.
    """
    with get_connection() as conn:
        if target_date:
            has_data = conn.execute(
                "SELECT 1 FROM intraday_prices "
                "WHERE ticker = ? AND substr(datetime, 1, 10) = ? LIMIT 1",
                (ticker, target_date),
            ).fetchone()
            if has_data:
                day = target_date
            else:
                fallback = conn.execute(
                    "SELECT MAX(substr(datetime, 1, 10)) AS d FROM intraday_prices "
                    "WHERE ticker = ? AND substr(datetime, 1, 10) < ?",
                    (ticker, target_date),
                ).fetchone()
                day = fallback["d"] if fallback else None
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

    발굴 스냅샷(stock_catalog.daily_change_pct)과 종목관리 추적분의 일별시세
    (prices.change_pct) 중 기준 거래일이 더 최신인 쪽을 쓴다. 발굴 딥수집(종목
    발굴 화면의 '데이터 수집')은 스케줄러에 없어 수동 실행 전까지 며칠씩 정체될
    수 있는 반면, 종목관리에 등록된 종목은 스케줄러가 매 거래일 갱신하므로 더
    최신인 경우가 흔하다. 발굴 스냅샷의 기준일은 딥수집 이후엔 metrics_date,
    딥수집 전(장중 카탈로그 동기화만 거친 상태)엔 updated_at 날짜다. ETF
    구성종목 전일대비 표시에 사용.
    """
    codes = [c for c in dict.fromkeys(codes) if c]  # 중복·빈값 제거, 순서 유지
    if not codes:
        return {}
    ph = ",".join("?" * len(codes))
    catalog: dict[str, tuple[str, float]] = {}
    price: dict[str, tuple[str, float]] = {}
    with get_connection() as conn:
        for r in conn.execute(
            f"""SELECT ticker, daily_change_pct,
                       COALESCE(metrics_date, date(updated_at)) AS as_of
                FROM stock_catalog
                WHERE ticker IN ({ph}) AND daily_change_pct IS NOT NULL""", codes
        ):
            if r["as_of"]:
                catalog[r["ticker"]] = (r["as_of"], r["daily_change_pct"])
        # 각 종목의 가장 최근 거래일 등락률.
        for r in conn.execute(
            f"""SELECT p.ticker, p.change_pct, p.date FROM prices p
                JOIN (SELECT ticker, MAX(date) AS d FROM prices
                      WHERE ticker IN ({ph}) GROUP BY ticker) m
                  ON p.ticker = m.ticker AND p.date = m.d
                WHERE p.change_pct IS NOT NULL""", codes
        ):
            price[r["ticker"]] = (r["date"], r["change_pct"])

    result: dict[str, float] = {}
    for code in codes:
        c = catalog.get(code)
        p = price.get(code)
        if c and p:
            result[code] = p[1] if p[0] > c[0] else c[1]
        elif c:
            result[code] = c[1]
        elif p:
            result[code] = p[1]
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
    """종목 뉴스를 최신순으로 조회(제목 중복 제거).

    재크롤링으로 같은 기사가 링크만 미세하게 다르게 저장되는 경우가 있어(link가
    PK라 완전 동일 링크만 upsert됨), 제목이 정확히 같으면 최신 1건만 남긴다.
    """
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT title, link, description, pub_date
            FROM news WHERE ticker = ?
            ORDER BY pub_date DESC LIMIT ?
            """,
            (ticker, limit * 3),
        ).fetchall()
    seen_titles: set[str] = set()
    out: list[dict] = []
    for r in rows:
        d = dict(r)
        if d["title"] in seen_titles:
            continue
        seen_titles.add(d["title"])
        out.append(d)
        if len(out) >= limit:
            break
    return out


def get_news_batch(tickers: list[str], limit: int) -> dict[str, list[dict]]:
    """여러 종목의 최신 뉴스를 한 쿼리로 조회(종목별 최신순)."""
    if not tickers:
        return {}
    placeholders = ",".join("?" * len(tickers))
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT ticker, title, link, description, pub_date
            FROM (
                SELECT ticker, title, link, description, pub_date,
                       ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY pub_date DESC) AS rn
                FROM news WHERE ticker IN ({placeholders})
            )
            WHERE rn <= ?
            ORDER BY ticker, pub_date DESC
            """,
            (*tickers, limit),
        ).fetchall()
    out: dict[str, list[dict]] = {t: [] for t in tickers}
    for r in rows:
        d = dict(r)
        out[d.pop("ticker")].append(d)
    return out


def reset_collected_data() -> dict:
    """수집 데이터 전체 삭제(stocks 목록은 보존). 테이블별 삭제 건수 반환.

    삭제 후 VACUUM으로 파일을 실제로 줄인다. 이걸 하지 않으면 전부 지운 뒤에도
    화면의 '데이터베이스 크기'가 그대로라 삭제가 안 된 것처럼 보인다.
    """
    tables = [
        "prices", "trading_flow", "intraday_prices", "news",
        "stock_fundamentals", "etf_fundamentals", "etf_holdings",
    ]
    deleted: dict[str, int] = {}
    with get_connection() as conn:
        for t in tables:
            cur = conn.execute(f"DELETE FROM {t}")
            deleted[t] = cur.rowcount
    # VACUUM은 트랜잭션 안에서 실행할 수 없어 커밋 이후 별도 연결로 처리한다.
    with get_connection() as conn:
        conn.execute("VACUUM")
    return deleted


def last_collection_time() -> str | None:
    """가장 최근 수집 시각(KST ISO). updated_at을 가진 테이블들의 최대값. 없으면 None.

    대시보드가 실제로 보는 값의 핵심인 시세·매매동향을 반드시 포함한다. 예전에는
    뉴스·펀더멘털·구성종목만 봐서, 시세만 새로 수집되고 뉴스가 건너뛰어지면
    '마지막 수집일시'가 옛날에 멈춰 있었다.
    """
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT MAX(t) AS t FROM (
                SELECT MAX(updated_at) AS t FROM prices
                UNION ALL SELECT MAX(updated_at) FROM trading_flow
                UNION ALL SELECT MAX(updated_at) FROM news
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


def get_latest_intraday_price(ticker: str) -> float | None:
    """가장 최근 분봉의 현재가(price). 목표가 알림 판정용 — 분봉은 1분 주기로
    갱신돼 일별 시세(prices, 10분 주기)보다 실시간성이 높다."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT price FROM intraday_prices WHERE ticker = ? "
            "ORDER BY datetime DESC LIMIT 1",
            (ticker,),
        ).fetchone()
    return row["price"] if row else None


# --- 알림 (alert_rules / alert_events) ----------------------------------------

def create_alert_rule(ticker: str, rule_type: str, target_price: float | None = None) -> dict:
    with get_connection() as conn:
        cur = conn.execute(
            """INSERT INTO alert_rules (ticker, rule_type, target_price)
               VALUES (?, ?, ?)""",
            (ticker, rule_type, target_price),
        )
        row = conn.execute(
            "SELECT * FROM alert_rules WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return dict(row)


def list_alert_rules(ticker: str | None = None) -> list[dict]:
    query = "SELECT * FROM alert_rules"
    params: tuple = ()
    if ticker:
        query += " WHERE ticker = ?"
        params = (ticker,)
    query += " ORDER BY created_at DESC"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def get_alert_rule(rule_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM alert_rules WHERE id = ?", (rule_id,)).fetchone()
    return dict(row) if row else None


def update_alert_rule(rule_id: int, **fields) -> dict | None:
    """status/target_price/last_triggered_at 등 주어진 필드만 갱신."""
    if not fields:
        return get_alert_rule(rule_id)
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE alert_rules SET {set_clause} WHERE id = ?",
            (*fields.values(), rule_id),
        )
        row = conn.execute("SELECT * FROM alert_rules WHERE id = ?", (rule_id,)).fetchone()
    return dict(row) if row else None


def try_trigger_alert_rule(rule_id: int, triggered_at: str) -> bool:
    """규칙을 'active' -> 'triggered'로 원자적으로 전환. 이미 트리거된 규칙이면 False.

    분봉 수집(스케줄러)과 온디맨드 수집(종목상세 조회)이 같은 종목을 거의 동시에
    갱신할 수 있어, 조회 후 갱신하는 두 단계로 나누면 두 스레드가 모두 '아직
    active'로 읽고 중복 알림을 만들 수 있다. WHERE status='active' 조건부
    UPDATE 하나로 먼저 통과한 스레드만 True를 받게 해 이를 막는다.
    """
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE alert_rules SET status = 'triggered', last_triggered_at = ? "
            "WHERE id = ? AND status = 'active'",
            (triggered_at, rule_id),
        )
    return cur.rowcount == 1


def delete_alert_rule(rule_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM alert_rules WHERE id = ?", (rule_id,))


def create_alert_event(
    rule_id: int, ticker: str, rule_type: str, message: str, value: float | None, basis: str
) -> dict:
    with get_connection() as conn:
        cur = conn.execute(
            """INSERT INTO alert_events (rule_id, ticker, rule_type, message, value, basis)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (rule_id, ticker, rule_type, message, value, basis),
        )
        row = conn.execute(
            "SELECT * FROM alert_events WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return dict(row)


def list_alert_events(ticker: str | None = None, unread_only: bool = False, limit: int = 50) -> list[dict]:
    where = []
    params: list = []
    if ticker:
        where.append("ticker = ?")
        params.append(ticker)
    if unread_only:
        where.append("read_at IS NULL")
    query = "SELECT * FROM alert_events"
    if where:
        query += " WHERE " + " AND ".join(where)
    query += " ORDER BY triggered_at DESC LIMIT ?"
    params.append(limit)
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def count_unread_alert_events() -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM alert_events WHERE read_at IS NULL"
        ).fetchone()
    return row["c"] if row else 0


def mark_alert_events_read(event_ids: list[int]) -> None:
    if not event_ids:
        return
    placeholders = ",".join("?" * len(event_ids))
    with get_connection() as conn:
        conn.execute(
            f"UPDATE alert_events SET read_at = datetime('now') "
            f"WHERE id IN ({placeholders}) AND read_at IS NULL",
            event_ids,
        )


# --- 매수/매도 거래내역 (stock_transactions) --------------------------------
#
# 아래 함수들은 (다른 repository 함수와 달리) 자체 커넥션을 열지 않고 인자로 받은
# conn을 그대로 쓴다. services/transactions.py가 "쓰기 → 전체 재계산 → 검증"을
# 하나의 트랜잭션으로 묶어, 검증 실패 시 get_connection()의 예외 처리(자동 rollback)로
# 방금 쓴 내용까지 함께 취소되게 하기 위함이다(레이스·부분반영 방지).

def create_transaction(
    conn, ticker: str, transaction_type: str, transaction_date: str,
    price: float, quantity: int, note: str | None = None,
) -> dict:
    cur = conn.execute(
        """INSERT INTO stock_transactions
           (ticker, transaction_type, transaction_date, price, quantity, note)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (ticker, transaction_type, transaction_date, price, quantity, note),
    )
    return get_transaction(conn, cur.lastrowid)


def list_transactions(conn, ticker: str) -> list[dict]:
    """종목의 전체 거래내역(날짜, id 오름차순 — 평단가 재계산이 시간순을 가정한다)."""
    rows = conn.execute(
        "SELECT * FROM stock_transactions WHERE ticker = ? ORDER BY transaction_date, id",
        (ticker,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_transaction(conn, transaction_id: int) -> dict | None:
    row = conn.execute(
        "SELECT * FROM stock_transactions WHERE id = ?", (transaction_id,)
    ).fetchone()
    return dict(row) if row else None


def update_transaction(conn, transaction_id: int, **fields) -> dict | None:
    if not fields:
        return get_transaction(conn, transaction_id)
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(
        f"UPDATE stock_transactions SET {set_clause} WHERE id = ?",
        (*fields.values(), transaction_id),
    )
    return get_transaction(conn, transaction_id)


def delete_transaction(conn, transaction_id: int) -> None:
    conn.execute("DELETE FROM stock_transactions WHERE id = ?", (transaction_id,))


def update_stock_position(
    conn, ticker: str, purchase_price: float | None, quantity: int | None,
    purchase_date: str | None,
) -> None:
    """거래내역 재계산 결과로 stocks의 매입정보 3컬럼을 통째로 덮어쓴다.

    update_stock()의 "필드가 요청에 있으면 NULL로 지운다" 부분 업데이트 로직과는
    무관하게, 여기서는 항상 세 값을 그대로 SET한다(거래내역이 유일한 소스이므로).
    """
    conn.execute(
        """UPDATE stocks SET purchase_price = ?, quantity = ?, purchase_date = ?,
           updated_at = datetime('now') WHERE ticker = ?""",
        (purchase_price, quantity, purchase_date, ticker),
    )
