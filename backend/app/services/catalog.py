"""종목 발굴(Screening)용 전체 종목 카탈로그 수집.

'종목목록수집'은 KOSPI·KOSDAQ 시가총액 상위 종목을 **stock_catalog** 테이블에
적재한다. 이 목록은 종목 발굴/검색(자동완성) 용도이며, 사용자가 관찰하는
워치리스트(stocks 테이블, 종목관리)와는 별개다.
"""
from __future__ import annotations

import logging
import threading

from app.database import get_connection
from app.services import naver_client

logger = logging.getLogger(__name__)

# 종목목록수집 진행상태(동기 수집 중, 동시 폴링이 읽는다).
# 단계: 0=코스피, 1=코스닥, 2=ETF, 3=저장 (프론트 StepProgressBar와 동일)
_lock = threading.Lock()
_progress: dict = {
    "status": "idle",       # idle | in_progress | completed | error
    "step_index": 0,
    "total_steps": 4,
    "items_collected": 0,
    "message": "",
}
_STEP = {"KOSPI": 0, "KOSDAQ": 1}


def get_progress() -> dict:
    with _lock:
        return dict(_progress)


def _upsert_row(conn, row: dict) -> None:
    """카탈로그 종목 1건 upsert(stock_catalog).

    발굴 필터용 market 값은 ETF는 'ETF', 주식은 시장(KOSPI/KOSDAQ)으로 둔다.
    marketValue 응답에 들어 있는 현재가·등락률·거래량·시총 스냅샷도 함께 저장한다.
    (수익률·수급은 별도 지표수집 단계에서 채운다.)
    """
    market = "ETF" if row["type"] == "ETF" else row.get("exchange")
    conn.execute(
        """
        INSERT INTO stock_catalog
            (ticker, name, type, market, market_value,
             close_price, daily_change_pct, volume, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(ticker) DO UPDATE SET
            name=excluded.name,
            type=excluded.type,
            market=excluded.market,
            market_value=excluded.market_value,
            close_price=excluded.close_price,
            daily_change_pct=excluded.daily_change_pct,
            volume=excluded.volume,
            updated_at=excluded.updated_at
        """,
        (row["ticker"], row["name"] or row["ticker"], row["type"], market,
         row.get("market_value"), row.get("close_price"),
         row.get("daily_change_pct"), row.get("volume")),
    )


def sync_catalog(market: str | None = None, limit: int | None = None) -> dict:
    """시장 종목을 stock_catalog에 upsert. limit=None이면 전체. 반환: {시장: 반영 건수}."""
    markets = (market,) if market else naver_client.MARKETS
    result: dict[str, int] = {}
    with get_connection() as conn:
        for mkt in markets:
            rows = naver_client.fetch_market_catalog(mkt, limit=limit)
            for row in rows:
                _upsert_row(conn, row)
            result[mkt] = len(rows)
            logger.info("Catalog synced %s: %d stocks", mkt, len(rows))
    return result


def sync_catalog_detailed(limit: int | None = None) -> dict:
    """KOSPI·KOSDAQ 전체 카탈로그 수집 후 프론트 계약용 상세 카운트 반환.

    limit=None이면 각 시장 전체 종목을 수집한다(원본과 동일한 전체 목록).
    반환: {kospi_count, kosdaq_count, etf_count, total_collected, saved_count}
    """
    per_market: dict[str, int] = {}
    etf_count = 0
    seen: set[str] = set()  # 이번 수집에서 반환된 ticker(잔존 행 정리에 사용)
    with _lock:
        _progress.update(status="in_progress", step_index=0, items_collected=0,
                         message="종목 목록 수집 시작...")
    try:
        with get_connection() as conn:
            for mkt in naver_client.MARKETS:
                with _lock:
                    _progress.update(step_index=_STEP[mkt], message=f"{mkt} 종목 수집 중...")
                rows = naver_client.fetch_market_catalog(mkt, limit=limit)
                for row in rows:
                    _upsert_row(conn, row)
                    seen.add(row["ticker"])
                    if row["type"] == "ETF":
                        etf_count += 1
                per_market[mkt] = len(rows)
                with _lock:
                    _progress["items_collected"] += len(rows)
                logger.info("Catalog synced %s: %d stocks", mkt, len(rows))
            with _lock:
                _progress.update(step_index=2, message="ETF 분류 중...")
                _progress.update(step_index=3, message="저장 중...")
            # 미수집 잔존 행 정리: 이번 수집에 없는(상폐·순위 이탈 등) 종목 삭제.
            # 전체 수집(limit=None)일 때만 안전하다 — 부분 수집에선 정상 종목까지 지워질 수 있음.
            removed = _prune_stale(conn, seen) if limit is None else 0
    except Exception:
        with _lock:
            _progress.update(status="error", message="수집 실패")
        raise

    # total_collected는 실제 저장 건수(=종목목록건수)와 일치해야 하므로 ticker 기준
    # 중복을 제거한 수를 쓴다. KOSPI·KOSDAQ 응답에 동시에 나오는 종목이 있어
    # sum(per_market)은 실제보다 크게 잡힌다.
    total = len(seen)
    with _lock:
        _progress.update(status="completed", step_index=4, items_collected=total,
                         message="수집 완료")
    return {
        "kospi_count": per_market.get("KOSPI", 0),
        "kosdaq_count": per_market.get("KOSDAQ", 0),
        "etf_count": etf_count,
        "total_collected": total,
        "saved_count": total,
        "removed_count": removed,
    }


def _prune_stale(conn, seen: set[str]) -> int:
    """이번 수집에서 반환되지 않은 잔존 카탈로그 행을 삭제. 삭제 건수 반환.

    seen이 비어 있으면(수집 실패로 오인) 전체 삭제를 막기 위해 아무것도 지우지 않는다.
    ticker 수가 많아 SQLite 변수 한도(999)를 넘으므로 임시 테이블로 대조한다.
    """
    if not seen:
        return 0
    conn.execute("CREATE TEMP TABLE IF NOT EXISTS _seen_tickers (ticker TEXT PRIMARY KEY)")
    conn.execute("DELETE FROM _seen_tickers")
    conn.executemany("INSERT OR IGNORE INTO _seen_tickers (ticker) VALUES (?)",
                     [(t,) for t in seen])
    cur = conn.execute(
        "DELETE FROM stock_catalog WHERE ticker NOT IN (SELECT ticker FROM _seen_tickers)"
    )
    conn.execute("DROP TABLE _seen_tickers")
    if cur.rowcount:
        logger.info("Catalog pruned %d stale rows", cur.rowcount)
    return cur.rowcount


def clear_catalog() -> int:
    """발굴 카탈로그(stock_catalog) 전체 삭제. 삭제 건수 반환."""
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM stock_catalog")
    with _lock:
        _progress.update(status="idle", step_index=0, items_collected=0, message="")
    return cur.rowcount
