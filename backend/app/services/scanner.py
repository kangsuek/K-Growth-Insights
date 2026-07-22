"""종목 발굴(Screening) — stock_catalog 지표 수집·검색·테마·추천.

'종목목록수집'으로 적재된 카탈로그 종목의 시세를 수집해 수익률·거래량 등
스크리닝 지표를 stock_catalog에 저장하고, 필터·정렬로 검색한다. 워치리스트
(stocks)와는 별개의 발굴 유니버스를 대상으로 한다.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

from app import config
from app.database import get_connection
from app.services import naver_client

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_cancel = threading.Event()
_progress: dict = {"status": "idle", "total": 0, "completed": 0, "updated": 0}

# 검색 정렬 허용 컬럼(인젝션 방지).
_SORT_COLUMNS = {
    "weekly_return", "monthly_return", "ytd_return", "volume",
    "close_price", "daily_change_pct", "foreign_net", "institutional_net", "name",
}


def get_progress() -> dict:
    with _lock:
        return dict(_progress)


# --- 지표 수집 ---------------------------------------------------------------

def _metrics_for(ticker: str) -> dict | None:
    """카탈로그 종목의 스크리닝 지표 계산(시세·매매동향 기반). 시세 없으면 None."""
    prices = naver_client.fetch_daily_prices(ticker, pages=3)  # 최신순
    if not prices or not prices[0].get("close_price"):
        return None
    n = len(prices)

    def _ret(idx):
        cur, base = prices[0].get("close_price"), prices[idx].get("close_price")
        return (cur - base) / base * 100 if cur and base else None

    weekly = _ret(min(4, n - 1)) if n >= 5 else None
    monthly = _ret(min(19, n - 1)) if n >= 20 else None
    year_start = date(date.today().year, 1, 1).isoformat()
    ytd_rows = [p for p in prices if (p.get("date") or "") >= year_start]
    ytd = None
    if len(ytd_rows) >= 2 and ytd_rows[0].get("close_price") and ytd_rows[-1].get("close_price"):
        ytd = (ytd_rows[0]["close_price"] - ytd_rows[-1]["close_price"]) / ytd_rows[-1]["close_price"] * 100

    flow = naver_client.fetch_trading_flow(ticker)  # 최신순
    foreign_net = flow[0].get("foreign_net") if flow else None
    inst_net = flow[0].get("institutional_net") if flow else None

    return {
        "close_price": prices[0].get("close_price"),
        "daily_change_pct": prices[0].get("change_pct"),
        "volume": prices[0].get("volume"),
        "weekly_return": weekly,
        "monthly_return": monthly,
        "ytd_return": ytd,
        "foreign_net": foreign_net,
        "institutional_net": inst_net,
    }


def _collect_one(ticker: str) -> int:
    if _cancel.is_set():
        return 0
    metrics = _metrics_for(ticker)
    with _lock:
        _progress["completed"] += 1
    if not metrics:
        return 0
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE stock_catalog SET
                close_price=?, daily_change_pct=?, volume=?, weekly_return=?,
                monthly_return=?, ytd_return=?, foreign_net=?, institutional_net=?,
                catalog_updated_at=datetime('now')
            WHERE ticker=?
            """,
            (metrics["close_price"], metrics["daily_change_pct"], metrics["volume"],
             metrics["weekly_return"], metrics["monthly_return"], metrics["ytd_return"],
             metrics["foreign_net"], metrics["institutional_net"], ticker),
        )
    with _lock:
        _progress["updated"] += 1
    return 1


def collect_catalog_data() -> dict:
    """활성 카탈로그 종목의 스크리닝 지표를 병렬 수집(동기)."""
    _cancel.clear()
    with get_connection() as conn:
        tickers = [r["ticker"] for r in
                   conn.execute("SELECT ticker FROM stock_catalog WHERE is_active=1")]
    with _lock:
        _progress.update(status="in_progress", total=len(tickers), completed=0, updated=0)
    workers = max(1, min(config.COLLECT_CONCURRENCY, len(tickers) or 1))
    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(_collect_one, tickers))
        status = "cancelled" if _cancel.is_set() else "completed"
        with _lock:
            _progress["status"] = status
        logger.info("[scanner] 카탈로그 지표 수집 %s: %d/%d 갱신",
                    status, _progress["updated"], len(tickers))
    except Exception as exc:  # noqa: BLE001
        logger.error("[scanner] 수집 실패: %s", exc, exc_info=True)
        with _lock:
            _progress["status"] = "error"
    return get_progress()


def cancel_collect() -> None:
    _cancel.set()


# --- 검색 / 테마 / 추천 -------------------------------------------------------

def _registered_tickers() -> set:
    with get_connection() as conn:
        return {r["ticker"] for r in conn.execute("SELECT ticker FROM stocks")}


def _row_to_item(row, registered: set) -> dict:
    d = dict(row)
    return {
        "ticker": d["ticker"], "name": d["name"], "type": d["type"],
        "market": d.get("market"), "sector": d.get("sector"),
        "close_price": d.get("close_price"), "daily_change_pct": d.get("daily_change_pct"),
        "volume": d.get("volume"), "weekly_return": d.get("weekly_return"),
        "monthly_return": d.get("monthly_return"), "ytd_return": d.get("ytd_return"),
        "ytd_base_date": None,
        "foreign_net": d.get("foreign_net"), "institutional_net": d.get("institutional_net"),
        "catalog_updated_at": d.get("catalog_updated_at"),
        "is_registered": d["ticker"] in registered,
    }


def search(filters: dict) -> dict:
    """조건 기반 카탈로그 검색. 반환 {items, total, page, page_size}."""
    where = ["is_active=1"]
    params: list = []
    market = filters.get("market")
    type_ = filters.get("type", "ETF")
    if market and market != "ALL":
        where.append("market=?")
        params.append(market)
    elif not market and type_ != "ALL":
        where.append("type=?")
        params.append(type_)
    if filters.get("q"):
        where.append("(ticker LIKE ? OR name LIKE ?)")
        params.extend([f"%{filters['q']}%", f"%{filters['q']}%"])
    if filters.get("sector"):
        where.append("sector=?")
        params.append(filters["sector"])
    for col, key in (("weekly_return", "weekly"), ("monthly_return", "monthly"), ("ytd_return", "ytd")):
        if filters.get(f"min_{key}_return") is not None:
            where.append(f"{col} >= ?")
            params.append(filters[f"min_{key}_return"])
        if filters.get(f"max_{key}_return") is not None:
            where.append(f"{col} <= ?")
            params.append(filters[f"max_{key}_return"])
    if filters.get("foreign_net_positive"):
        where.append("foreign_net > 0")
    if filters.get("institutional_net_positive"):
        where.append("institutional_net > 0")

    where_sql = " AND ".join(where)
    sort_by = filters.get("sort_by") if filters.get("sort_by") in _SORT_COLUMNS else "weekly_return"
    sort_dir = "ASC" if str(filters.get("sort_dir", "desc")).lower() == "asc" else "DESC"
    page = max(1, int(filters.get("page", 1)))
    page_size = min(50, max(1, int(filters.get("page_size", 20))))
    offset = (page - 1) * page_size

    registered = _registered_tickers()
    with get_connection() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS c FROM stock_catalog WHERE {where_sql}", params
        ).fetchone()["c"]
        # NULL 지표는 정렬 뒤로.
        rows = conn.execute(
            f"""SELECT * FROM stock_catalog WHERE {where_sql}
                ORDER BY ({sort_by} IS NULL), {sort_by} {sort_dir}
                LIMIT ? OFFSET ?""",
            [*params, page_size, offset],
        ).fetchall()
    return {
        "items": [_row_to_item(r, registered) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def themes() -> list[dict]:
    """섹터별 그룹(종목 수·평균 주간수익률·상위 종목)."""
    registered = _registered_tickers()
    with get_connection() as conn:
        sectors = conn.execute(
            """SELECT sector, COUNT(*) AS cnt, AVG(weekly_return) AS avg_wr
               FROM stock_catalog WHERE is_active=1 AND sector IS NOT NULL
               GROUP BY sector ORDER BY cnt DESC"""
        ).fetchall()
        result = []
        for s in sectors:
            top = conn.execute(
                """SELECT * FROM stock_catalog
                   WHERE is_active=1 AND sector=? AND weekly_return IS NOT NULL
                   ORDER BY weekly_return DESC LIMIT 5""",
                (s["sector"],),
            ).fetchall()
            result.append({
                "sector": s["sector"], "count": s["cnt"],
                "avg_weekly_return": s["avg_wr"],
                "top_performers": [_row_to_item(r, registered) for r in top],
            })
    return result


_PRESETS = [
    ("weekly_top_return", "주간 수익률 상위", "최근 1주간 수익률이 높은 종목", "weekly_return", "desc", None),
    ("foreign_buying", "외국인 순매수 상위", "외국인 매수세가 강한 종목", "foreign_net", "desc", "foreign_net"),
    ("institutional_buying", "기관 순매수 상위", "기관 매수세가 강한 종목", "institutional_net", "desc", "institutional_net"),
    ("high_volume", "거래량 상위", "거래가 활발한 종목", "volume", "desc", None),
    ("weekly_worst_return", "주간 하락 상위 (역발상)", "최근 1주간 하락폭이 큰 종목", "weekly_return", "asc", None),
]


def recommendations(limit: int = 5) -> list[dict]:
    registered = _registered_tickers()
    out = []
    with get_connection() as conn:
        for preset_id, title, desc, sort_by, sort_dir, positive_col in _PRESETS:
            where = ["is_active=1", f"{sort_by} IS NOT NULL"]
            if positive_col:
                where.append(f"{positive_col} > 0")
            direction = "ASC" if sort_dir == "asc" else "DESC"
            rows = conn.execute(
                f"""SELECT * FROM stock_catalog WHERE {' AND '.join(where)}
                    ORDER BY {sort_by} {direction} LIMIT ?""",
                (limit,),
            ).fetchall()
            out.append({
                "preset_id": preset_id, "title": title, "description": desc,
                "items": [_row_to_item(r, registered) for r in rows],
            })
    return out
