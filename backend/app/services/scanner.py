"""종목 발굴(Screening) — stock_catalog 지표 수집·검색·테마·추천.

'종목목록수집'으로 적재된 카탈로그 종목의 시세를 수집해 수익률·거래량 등
스크리닝 지표를 stock_catalog에 저장하고, 필터·정렬로 검색한다. 워치리스트
(stocks)와는 별개의 발굴 유니버스를 대상으로 한다.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

from app import config, timeutil
from app.database import get_connection
from app.services import metrics, naver_client
from app.timeutil import KST, MARKET_CLOSE, MARKET_OPEN

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
    "close_price", "daily_change_pct", "live_change_pct", "foreign_net", "institutional_net", "name",
}

# '지속 상승추세' 판정 임계값. 연초대비 수익률만 보면 폭락 후 반등도 +로 잡혀
# (KODEX 건설 YTD +58%인데 7월 한 달 -12.8%), 추세의 '꾸준함'을 함께 본다.
#
# trend_mdd 하한(-2%)은 현금성·단기채권 ETF를 걸러낸다. 머니마켓·CD금리류는 낙폭이
# 사실상 0이라 R²가 100%로 나오지만 연 1~2%짜리여서 '상승추세'로 볼 값이 아니다.
SUSTAINED_UPTREND = {
    "trend_r2 >= ?": 60,          # 직선처럼 올랐는가
    "trend_mdd >= ?": -25,        # 도중에 크게 무너지지 않았는가
    "trend_mdd <= ?": -2,         # 현금성·단기채권 제외
    "trend_win_rate >= ?": 60,    # 월별로 대체로 올랐는가
    "trend_above_ma >= ?": 60,    # 20일선 위를 유지했는가
    "ytd_return > ?": 0,          # 연초 대비 상승
}

# '+만 보기' 토글 → 대상 컬럼. 값은 컬럼명이므로 여기 없는 키는 SQL에 닿지 않는다.
_POSITIVE_FILTERS = {
    "daily_change_positive": "daily_change_pct",
    "weekly_return_positive": "weekly_return",
    "monthly_return_positive": "monthly_return",
    "ytd_return_positive": "ytd_return",
    "foreign_net_positive": "foreign_net",
    "institutional_net_positive": "institutional_net",
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
    """전년도 마지막 거래일까지 닿는 데 필요한 일별시세 페이지 수(경과일 기반 추정).

    YTD 기준가가 전년 12월 종가이므로 올해 경과분에 1페이지를 더해 여유를 둔다.
    """
    doy = date.today().timetuple().tm_yday
    trading_days = int(doy * 5 / 7)          # 경과 거래일 ≈ 경과일 × 5/7
    pages = trading_days // naver_client.MAX_PAGE_SIZE + 2  # 전년 12월까지 1페이지 여유
    return max(1, min(pages, _MAX_METRIC_PAGES))


def confirmed_prices(prices: list[dict], now: datetime | None = None) -> list[dict]:
    """장중 미확정 행을 걷어낸 최신순 시세.

    네이버 일별시세는 장중에도 '오늘' 행을 **현재가**로 내려준다. 그 값을 종가로 저장하면
    한 행 안에서 기준일이 어긋난다 — 가격은 당일 장중인데 매매동향(외국인·기관)은 장
    마감 후에야 확정되므로 전일 값이 들어오기 때문이다. 마감(15:40) 전이면 오늘 행을
    버리고 직전 거래일을 기준일로 삼아 가격·수급·수익률을 한 날짜로 맞춘다.
    """
    now = (now or datetime.now(KST)).astimezone(KST)
    if now.time() >= MARKET_CLOSE:
        return prices
    today = now.date().isoformat()
    return [p for p in prices if str(p.get("date") or "")[:10] < today]


def _metrics_for(ticker: str) -> dict | None:
    """카탈로그 종목의 수익률·수급·추세 지표 계산(시세·매매동향 기반). 시세 없으면 None.

    수익률 기준일은 네이버증권과 동일하다(services/metrics.py 참고).

    추세 지속성(R²·MDD·월승률)은 연초 이후 시세 **전체**가 있어야 계산되므로 항상 그만큼
    딥페이징한다. 예전에는 YTD 기준가만 캐시해 1페이지로 끝냈지만, 기준가 한 점으로는
    '도중에 무너진 적 있는지'를 알 수 없어 캐시 경로를 걷어냈다.
    """
    prices = confirmed_prices(
        naver_client.fetch_daily_prices(ticker, pages=_pages_for_ytd()))
    if not prices or not prices[0].get("close_price"):
        return None
    as_of = str(prices[0].get("date") or "")[:10]
    cur = prices[0]["close_price"]

    # YTD 기준가는 전년도 마지막 거래일.
    base_date, base_price = metrics.ytd_base(prices)
    ytd_base_of_year = base_price      # 연중 상장 폴백 전 값(월승률 첫 달 비교용)
    if base_price is None:
        # 연중 상장 종목은 전년도 시세가 없다. 상장 후 첫 거래일을 기준으로 대신 쓴다.
        oldest = next((p for p in reversed(prices) if p.get("close_price")), None)
        if oldest:
            base_date = str(oldest.get("date") or "")[:10]
            base_price = oldest["close_price"]
    ytd = (cur - base_price) / base_price * 100 if base_price else None

    trend = metrics.trend_metrics(
        prices, since=f"{date.today().year}-01-01", base_price=ytd_base_of_year)

    # 수급도 가격과 같은 거래일로 맞춘다(as_of 이하 가장 최근 확정분).
    flow = naver_client.fetch_trading_flow(ticker)  # 최신순
    foreign_net = inst_net = None
    for row in flow or []:
        if str(row.get("date") or "")[:10] <= as_of:
            foreign_net, inst_net = row.get("foreign_net"), row.get("institutional_net")
            break

    return {
        "close_price": cur,
        "daily_change_pct": prices[0].get("change_pct"),
        "volume": prices[0].get("volume"),
        "weekly_return": metrics.weekly_return(prices),
        "monthly_return": metrics.monthly_return(prices),
        "ytd_return": ytd,
        "ytd_base_date": base_date,
        "ytd_base_price": base_price,
        "metrics_date": as_of,
        **trend,
        "foreign_net": foreign_net,
        "institutional_net": inst_net,
    }


def _supply_target_groups(conn, only_missing: bool = False) -> list[tuple[str, list[str]]]:
    """딥수집 대상을 단계별로 반환: 전체 ETF → KOSPI 시총 상위 N → KOSDAQ 시총 상위 N.

    (단계 라벨, 티커 목록) 순서가 곧 진행률 바의 단계 순서다.

    only_missing=True면 아직 한 번도 지표를 못 받은 종목(catalog_updated_at IS NULL)만
    남긴다. 종목목록수집이 새로 넣은 종목을 전체 재수집 없이 보강하는 데 쓴다. 상위 N
    선별은 먼저 하고 그 안에서 걸러야 순위 밖 종목이 딸려 들어오지 않는다.
    """
    gap = " AND catalog_updated_at IS NULL" if only_missing else ""
    groups: list[tuple[str, list[str]]] = [
        ("ETF", [
            r["ticker"] for r in conn.execute(
                f"SELECT ticker FROM stock_catalog "
                f"WHERE is_active=1 AND type='ETF'{gap}"
            )
        ])
    ]
    for market, label, top_n in (
        ("KOSPI", "코스피", KOSPI_TOP_N_SUPPLY),
        ("KOSDAQ", "코스닥", KOSDAQ_TOP_N_SUPPLY),
    ):
        groups.append((label, [
            r["ticker"] for r in conn.execute(
                f"""SELECT ticker FROM (
                        SELECT ticker, catalog_updated_at FROM stock_catalog
                        WHERE is_active=1 AND market=? AND type!='ETF'
                        ORDER BY (market_value IS NULL), market_value DESC LIMIT ?
                    ) WHERE 1=1{gap}""",
                (market, top_n),
            )
        ]))
    return groups


def count_missing_metrics() -> int:
    """딥수집 대상 중 아직 지표를 못 받은 종목 수."""
    with get_connection() as conn:
        return sum(len(tickers) for _, tickers in _supply_target_groups(conn, only_missing=True))


def _collect_one(ticker: str) -> int:
    if _cancel.is_set():
        return 0
    row = _metrics_for(ticker)
    with _lock:
        _progress["completed"] += 1
        _progress["message"] = (
            f"{_progress['step_label']} 지표 수집 중... "
            f"({_progress['completed']:,}/{_progress['total']:,})"
        )
    if not row:
        return 0
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE stock_catalog SET
                close_price=?, daily_change_pct=?, volume=?, weekly_return=?,
                monthly_return=?, ytd_return=?, ytd_base_date=?, ytd_base_price=?,
                metrics_date=?, trend_r2=?, trend_mdd=?, trend_win_rate=?,
                trend_above_ma=?, foreign_net=?, institutional_net=?,
                catalog_updated_at=datetime('now')
            WHERE ticker=?
            """,
            (row["close_price"], row["daily_change_pct"], row["volume"],
             row["weekly_return"], row["monthly_return"], row["ytd_return"],
             row["ytd_base_date"], row["ytd_base_price"], row["metrics_date"],
             row["trend_r2"], row["trend_mdd"], row["trend_win_rate"],
             row["trend_above_ma"], row["foreign_net"], row["institutional_net"], ticker),
        )
    with _lock:
        _progress["updated"] += 1
    return 1


def collect_catalog_data(only_missing: bool = False) -> dict:
    """발굴 딥수집: 시총 상위 + 전체 ETF의 수익률·수급 지표를 병렬 수집(동기).

    현재가·등락률·거래량은 종목목록수집이 이미 채웠으므로 여기서는 대상만 보강한다.
    only_missing=True면 아직 지표가 없는 종목만 채운다(종목목록수집 직후 보강용).
    """
    _cancel.clear()
    with get_connection() as conn:
        groups = _supply_target_groups(conn, only_missing=only_missing)
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
                list(pool.map(_collect_one, tickers))
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

def _last_market_close(now: datetime) -> datetime:
    """가장 최근 장 마감(확정) 시각. 평일 15:40 이후면 오늘, 아니면 직전 거래일 15:40."""
    if now.weekday() < 5 and now.time() >= MARKET_CLOSE:
        return datetime.combine(now.date(), MARKET_CLOSE, tzinfo=KST)
    day = now.date() - timedelta(days=1)
    while day.weekday() >= 5:  # 토(5)/일(6) 건너뜀
        day -= timedelta(days=1)
    return datetime.combine(day, MARKET_CLOSE, tzinfo=KST)


def check_freshness(now: datetime | None = None) -> dict:
    """발굴 지표 데이터의 최신 여부 판정.

    반환 {"fresh": bool, "last_updated": ISO|None, "missing": int}

    - 장외: 최근 장 마감 확정분(catalog_updated_at >= 직전 마감)을 확보했으면 fresh.
    - 장중(평일 09:00~15:40): 가격이 계속 움직이므로 TTL(SCANNER_COLLECT_TTL_HOURS)
      이내 수집분만 fresh로 본다.
    - 수집 이력 없음(NULL): stale.

    missing은 딥수집 대상 중 아직 지표를 못 받은 종목 수다. fresh와 별개로 센다 —
    종목목록수집이 새 종목을 넣어도 기존 종목이 최신이면 fresh로 판정돼, 새 종목의
    수익률·수급이 영영 비어 있었다. 호출부는 fresh여도 missing이 있으면 보강 수집한다.
    """
    missing = count_missing_metrics()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT MAX(catalog_updated_at) AS last FROM stock_catalog "
            "WHERE catalog_updated_at IS NOT NULL"
        ).fetchone()
    last = timeutil.parse_db_timestamp(row["last"] if row else None)
    if last is None:
        return {"fresh": False, "last_updated": None, "missing": missing}

    now = (now or datetime.now(KST)).astimezone(KST)
    if now.weekday() < 5 and MARKET_OPEN <= now.time() <= MARKET_CLOSE:
        fresh = (now - last) < timedelta(hours=config.SCANNER_COLLECT_TTL_HOURS)
    else:
        fresh = last >= _last_market_close(now)

    return {"fresh": fresh, "last_updated": timeutil.to_kst_iso(last), "missing": missing}


# --- 검색 / 테마 / 추천 -------------------------------------------------------

def _registered_tickers() -> set:
    with get_connection() as conn:
        return {r["ticker"] for r in conn.execute("SELECT ticker FROM stocks")}


def _latest_ts(*values) -> str | None:
    """DB 타임스탬프 중 가장 나중 것을 KST ISO로. 모두 없으면 None.

    저장 형식이 'YYYY-MM-DD HH:MM:SS'(UTC)로 같아 문자열 비교로 대소를 가린다.
    """
    present = [v for v in values if v]
    return timeutil.to_kst_iso(max(present)) if present else None


def _row_to_item(row, registered: set) -> dict:
    d = dict(row)
    return {
        "ticker": d["ticker"], "name": d["name"], "type": d["type"],
        "market": d.get("market"), "sector": d.get("sector"),
        "close_price": d.get("close_price"), "daily_change_pct": d.get("daily_change_pct"),
        "live_change_pct": d.get("live_change_pct"),
        "volume": d.get("volume"), "weekly_return": d.get("weekly_return"),
        "monthly_return": d.get("monthly_return"), "ytd_return": d.get("ytd_return"),
        "ytd_base_date": d.get("ytd_base_date"),
        # 수익률·수급이 어느 거래일 기준인지(장중 수집분과 확정분 구분).
        "metrics_date": d.get("metrics_date"),
        # 연초 이후 추세 지속성 — '지속 상승추세' 필터의 판정 근거.
        "trend_r2": d.get("trend_r2"), "trend_mdd": d.get("trend_mdd"),
        "trend_win_rate": d.get("trend_win_rate"),
        "trend_above_ma": d.get("trend_above_ma"),
        "foreign_net": d.get("foreign_net"), "institutional_net": d.get("institutional_net"),
        # 한 행의 값이 두 수집 단계에서 온다. 수익률·수급은 발굴 지표수집만
        # (catalog_updated_at) 채우지만, 현재가·등락률·거래량은 종목목록수집
        # (updated_at)과 지표수집 **양쪽 다** 쓴다. 그래서 시세 시각은 둘 중 나중
        # 것이다. 지표수집만 돌린 종목의 시세를 오래된 것으로 표시하지 않기 위함.
        "price_updated_at": _latest_ts(d.get("updated_at"), d.get("catalog_updated_at")),
        "catalog_updated_at": timeutil.to_kst_iso(d.get("catalog_updated_at")),
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
    # 상승 필터: 값이 0보다 큰 종목만. 0(보합)과 NULL(미수집)은 제외된다.
    # 최소%(min_*) 입력은 `>= 0`이라 보합도 걸리므로 별도로 둔다.
    for key, col in _POSITIVE_FILTERS.items():
        if filters.get(key):
            where.append(f"{col} > 0")
    if filters.get("sustained_uptrend"):
        for cond, value in SUSTAINED_UPTREND.items():
            where.append(cond)
            params.append(value)

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
