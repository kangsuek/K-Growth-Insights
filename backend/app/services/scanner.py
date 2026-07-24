"""종목 발굴(Screening) — stock_catalog 지표 수집·검색·테마·추천.

'종목목록수집'으로 적재된 카탈로그 종목의 시세를 수집해 수익률·거래량 등
스크리닝 지표를 stock_catalog에 저장하고, 필터·정렬로 검색한다. 워치리스트
(stocks)와는 별개의 발굴 유니버스를 대상으로 한다.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo

from app import config
from app.database import get_connection
from app.services import naver_client

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_cancel = threading.Event()
# 발굴 지표 수집 진행상태(백그라운드 수집 중, 동시 폴링이 읽는다).
# 단계: 0=ETF, 1=코스피, 2=코스닥 (프론트 StepProgressBar와 동일)
_progress: dict = {
    "status": "idle",       # idle | in_progress | completed | cancelled | error
    "total": 0,
    "completed": 0,
    "updated": 0,
    "step_index": 0,
    "total_steps": 3,
    "step_label": "",
    "message": "",
}

# 검색 정렬 허용 컬럼(인젝션 방지).
_SORT_COLUMNS = {
    "weekly_return", "monthly_return", "ytd_return", "volume",
    "close_price", "daily_change_pct", "foreign_net", "institutional_net", "name",
}


def get_progress() -> dict:
    """진행 상태 + 프론트 진행률 바가 쓰는 파생 필드(percent·items_collected)."""
    with _lock:
        snapshot = dict(_progress)
    total = snapshot.get("total") or 0
    done = snapshot.get("completed") or 0
    snapshot["percent"] = min(100, int(done / total * 100)) if total else 0
    snapshot["items_collected"] = snapshot.get("updated", 0)
    return snapshot


# --- 지표 수집 ---------------------------------------------------------------
#
# 수급(외국인/기관)·수익률은 종목마다 개별 조회가 필요해 비싸다. 참조(ETFWeeklyReport)와
# 동일하게 **시총 상위 + 전체 ETF만** 딥수집하고, 나머지 종목은 종목목록수집이 캡처한
# 현재가·등락률·거래량 스냅샷만 사용한다. 현재가/등락률/거래량은 종목목록수집 단계에서
# 이미 채워지므로 여기서는 수익률·수급을 채운다.
KOSPI_TOP_N_SUPPLY = 200
KOSDAQ_TOP_N_SUPPLY = 300
_MAX_METRIC_PAGES = 8   # YTD 딥페이징 상한(약 2년치 안전장치)


def _pages_for_ytd() -> int:
    """올해 첫 거래일까지 닿는 데 필요한 일별시세 페이지 수(경과일 기반 추정)."""
    doy = date.today().timetuple().tm_yday
    trading_days = int(doy * 5 / 7)          # 경과 거래일 ≈ 경과일 × 5/7
    pages = trading_days // naver_client.MAX_PAGE_SIZE + 2  # 1페이지 여유
    return max(1, min(pages, _MAX_METRIC_PAGES))


def _metrics_for(ticker: str, cached_ytd_base: dict | None = None) -> dict | None:
    """카탈로그 종목의 수익률·수급 지표 계산(시세·매매동향 기반). 시세 없으면 None.

    cached_ytd_base가 올해 것이면 1월까지 딥페이징하지 않고 캐시 기준가로 YTD를 계산한다.
    """
    year = date.today().year
    year_start = f"{year}-01-01"
    use_cache = bool(
        cached_ytd_base and cached_ytd_base.get("price")
        and str(cached_ytd_base.get("date", "")).startswith(str(year))
    )
    pages = 1 if use_cache else _pages_for_ytd()
    prices = naver_client.fetch_daily_prices(ticker, pages=pages)  # 최신순
    if not prices or not prices[0].get("close_price"):
        return None
    n = len(prices)
    cur = prices[0]["close_price"]

    def _ret(idx):
        base = prices[idx].get("close_price")
        return (cur - base) / base * 100 if base else None

    weekly = _ret(min(4, n - 1)) if n >= 5 else None
    monthly = _ret(min(19, n - 1)) if n >= 20 else None

    # YTD: 캐시가 유효하면 캐시 기준가, 아니면 올해 가장 오래된 거래일을 기준가로 잡고 캐시.
    if use_cache:
        base_price, base_date = cached_ytd_base["price"], cached_ytd_base["date"]
    else:
        ytd_rows = [p for p in prices if (p.get("date") or "") >= year_start]
        if ytd_rows and ytd_rows[-1].get("close_price"):
            base_price, base_date = ytd_rows[-1]["close_price"], ytd_rows[-1]["date"]
        else:
            base_price = base_date = None
    ytd = (cur - base_price) / base_price * 100 if base_price else None

    flow = naver_client.fetch_trading_flow(ticker)  # 최신순
    foreign_net = flow[0].get("foreign_net") if flow else None
    inst_net = flow[0].get("institutional_net") if flow else None

    return {
        "close_price": cur,
        "daily_change_pct": prices[0].get("change_pct"),
        "volume": prices[0].get("volume"),
        "weekly_return": weekly,
        "monthly_return": monthly,
        "ytd_return": ytd,
        "ytd_base_date": base_date,
        "ytd_base_price": base_price,
        "foreign_net": foreign_net,
        "institutional_net": inst_net,
    }


def _supply_target_groups(conn) -> list[tuple[str, list[str]]]:
    """딥수집 대상을 단계별로 반환: 전체 ETF → KOSPI 시총 상위 N → KOSDAQ 시총 상위 N.

    (단계 라벨, 티커 목록) 순서가 곧 진행률 바의 단계 순서다.
    """
    groups: list[tuple[str, list[str]]] = [
        ("ETF", [
            r["ticker"] for r in conn.execute(
                "SELECT ticker FROM stock_catalog WHERE is_active=1 AND type='ETF'"
            )
        ])
    ]
    for market, label, top_n in (
        ("KOSPI", "코스피", KOSPI_TOP_N_SUPPLY),
        ("KOSDAQ", "코스닥", KOSDAQ_TOP_N_SUPPLY),
    ):
        groups.append((label, [
            r["ticker"] for r in conn.execute(
                """SELECT ticker FROM stock_catalog
                   WHERE is_active=1 AND market=? AND type!='ETF'
                   ORDER BY (market_value IS NULL), market_value DESC LIMIT ?""",
                (market, top_n),
            )
        ]))
    return groups


def _supply_targets(conn) -> list[str]:
    """딥수집 대상 티커(단계 구분 없이 평탄화)."""
    return [ticker for _, tickers in _supply_target_groups(conn) for ticker in tickers]


def _load_ytd_base_cache(conn) -> dict[str, dict]:
    """저장된 올해 YTD 기준가 로드 → 딥페이징 생략용."""
    cache: dict[str, dict] = {}
    for r in conn.execute(
        "SELECT ticker, ytd_base_date, ytd_base_price FROM stock_catalog "
        "WHERE ytd_base_price IS NOT NULL AND ytd_base_date IS NOT NULL"
    ):
        cache[r["ticker"]] = {"date": r["ytd_base_date"], "price": r["ytd_base_price"]}
    return cache


def _collect_one(ticker: str, cached_ytd_base: dict | None = None) -> int:
    if _cancel.is_set():
        return 0
    metrics = _metrics_for(ticker, cached_ytd_base)
    with _lock:
        _progress["completed"] += 1
        _progress["message"] = (
            f"{_progress['step_label']} 지표 수집 중... "
            f"({_progress['completed']:,}/{_progress['total']:,})"
        )
    if not metrics:
        return 0
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE stock_catalog SET
                close_price=?, daily_change_pct=?, volume=?, weekly_return=?,
                monthly_return=?, ytd_return=?, ytd_base_date=?, ytd_base_price=?,
                foreign_net=?, institutional_net=?, catalog_updated_at=datetime('now')
            WHERE ticker=?
            """,
            (metrics["close_price"], metrics["daily_change_pct"], metrics["volume"],
             metrics["weekly_return"], metrics["monthly_return"], metrics["ytd_return"],
             metrics["ytd_base_date"], metrics["ytd_base_price"],
             metrics["foreign_net"], metrics["institutional_net"], ticker),
        )
    with _lock:
        _progress["updated"] += 1
    return 1


def collect_catalog_data() -> dict:
    """발굴 딥수집: 시총 상위 + 전체 ETF의 수익률·수급 지표를 병렬 수집(동기).

    현재가·등락률·거래량은 종목목록수집이 이미 채웠으므로 여기서는 대상만 보강한다.
    """
    _cancel.clear()
    with get_connection() as conn:
        groups = _supply_target_groups(conn)
        ytd_cache = _load_ytd_base_cache(conn)
    total = sum(len(tickers) for _, tickers in groups)
    with _lock:
        _progress.update(status="in_progress", total=total, completed=0, updated=0,
                         step_index=0, total_steps=len(groups),
                         step_label=groups[0][0], message="수집 시작 중...")
    try:
        # 단계(ETF→코스피→코스닥)별로 순차 실행해 진행률 바의 현재 단계를 표시한다.
        for idx, (label, tickers) in enumerate(groups):
            if _cancel.is_set():
                break
            with _lock:
                _progress.update(step_index=idx, step_label=label,
                                 message=f"{label} 지표 수집 중...")
            if not tickers:
                continue
            workers = max(1, min(config.COLLECT_CONCURRENCY, len(tickers)))
            with ThreadPoolExecutor(max_workers=workers) as pool:
                list(pool.map(lambda t: _collect_one(t, ytd_cache.get(t)), tickers))
        status = "cancelled" if _cancel.is_set() else "completed"
        with _lock:
            updated = _progress["updated"]
            _progress.update(
                status=status,
                step_index=len(groups) if status == "completed" else _progress["step_index"],
                message=(f"발굴 지표 수집 완료 ({updated:,}개 갱신)"
                         if status == "completed" else "수집이 중지되었습니다"),
            )
        logger.info("[scanner] 발굴 지표 수집 %s: %d/%d 갱신", status, updated, total)
    except Exception as exc:  # noqa: BLE001
        logger.error("[scanner] 수집 실패: %s", exc, exc_info=True)
        with _lock:
            _progress.update(status="error", message="수집 중 오류가 발생했습니다")
    return get_progress()


def cancel_collect() -> None:
    _cancel.set()


# --- 수집 freshness 가드 -----------------------------------------------------
#
# 딥수집은 종목마다 개별 조회라 비싸므로, 이미 최신이면 수집하지 않고 프론트에
# fresh를 돌려준다(프론트가 "이미 최신입니다 → 다시 수집?"을 확인). force=true면
# 이 가드를 건너뛴다.

KST = ZoneInfo("Asia/Seoul")
MARKET_OPEN = dtime(9, 0)
MARKET_CLOSE = dtime(15, 40)   # 종가 확정 시각(scheduler와 동일)


def _parse_db_timestamp(value) -> datetime | None:
    """catalog_updated_at을 aware datetime으로 변환.

    SQLite `datetime('now')`로 저장돼 UTC 기준 naive 문자열이므로 UTC를 붙인다.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace(" ", "T").split(".")[0])
        except ValueError:
            return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def _last_market_close(now: datetime) -> datetime:
    """가장 최근 장 마감(확정) 시각. 평일 15:40 이후면 오늘, 아니면 직전 거래일 15:40."""
    if now.weekday() < 5 and now.time() >= MARKET_CLOSE:
        return datetime.combine(now.date(), MARKET_CLOSE, tzinfo=KST)
    day = now.date() - timedelta(days=1)
    while day.weekday() >= 5:  # 토(5)/일(6) 건너뜀
        day -= timedelta(days=1)
    return datetime.combine(day, MARKET_CLOSE, tzinfo=KST)


def check_freshness(now: datetime | None = None) -> dict:
    """발굴 지표 데이터의 최신 여부 판정. {"fresh": bool, "last_updated": ISO|None}

    - 장외: 최근 장 마감 확정분(catalog_updated_at >= 직전 마감)을 확보했으면 fresh.
    - 장중(평일 09:00~15:40): 가격이 계속 움직이므로 TTL(SCANNER_COLLECT_TTL_HOURS)
      이내 수집분만 fresh로 본다.
    - 수집 이력 없음(NULL): stale.
    """
    with get_connection() as conn:
        row = conn.execute(
            "SELECT MAX(catalog_updated_at) AS last FROM stock_catalog "
            "WHERE catalog_updated_at IS NOT NULL"
        ).fetchone()
    last = _parse_db_timestamp(row["last"] if row else None)
    if last is None:
        return {"fresh": False, "last_updated": None}

    now = (now or datetime.now(KST)).astimezone(KST)
    if now.weekday() < 5 and MARKET_OPEN <= now.time() <= MARKET_CLOSE:
        fresh = (now - last) < timedelta(hours=config.SCANNER_COLLECT_TTL_HOURS)
    else:
        fresh = last >= _last_market_close(now)

    # 프론트가 로컬 시각으로 표시하므로 KST 기준 naive ISO로 돌려준다.
    return {
        "fresh": fresh,
        "last_updated": last.astimezone(KST).replace(tzinfo=None).isoformat(),
    }


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
        "ytd_base_date": d.get("ytd_base_date"),
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
        # 평균 주간수익률 내림차순 정렬(원본 ETFWeeklyReport와 동일).
        # 프론트 그리드가 배열 순서대로 좌→우로 채우므로 수익률 높은 섹터가 앞에 온다.
        # 평균값이 없는(멤버 전원 미수집) 섹터는 뒤로 보낸다.
        sectors = conn.execute(
            """SELECT sector, COUNT(*) AS cnt, AVG(weekly_return) AS avg_wr
               FROM stock_catalog WHERE is_active=1 AND sector IS NOT NULL
               GROUP BY sector ORDER BY (avg_wr IS NULL), avg_wr DESC"""
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
