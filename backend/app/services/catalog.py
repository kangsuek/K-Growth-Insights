"""종목 발굴(Screening)용 전체 종목 카탈로그 수집.

'종목목록수집'은 KOSPI·KOSDAQ 시가총액 상위 종목을 **stock_catalog** 테이블에
적재한다. 이 목록은 종목 발굴/검색(자동완성) 용도이며, 사용자가 관찰하는
워치리스트(stocks 테이블, 종목관리)와는 별개다.
"""
from __future__ import annotations

import logging

from app.database import get_connection
from app.services import naver_client

logger = logging.getLogger(__name__)


def _upsert_row(conn, row: dict) -> None:
    """카탈로그 종목 1건 upsert(stock_catalog).

    원본과 동일하게 발굴 필터용 market 값은 ETF는 'ETF', 주식은 시장(KOSPI/KOSDAQ)으로 둔다.
    """
    market = "ETF" if row["type"] == "ETF" else row.get("exchange")
    conn.execute(
        """
        INSERT INTO stock_catalog (ticker, name, type, market, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(ticker) DO UPDATE SET
            name=excluded.name,
            type=excluded.type,
            market=excluded.market,
            updated_at=excluded.updated_at
        """,
        (row["ticker"], row["name"] or row["ticker"], row["type"], market),
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
    with get_connection() as conn:
        for mkt in naver_client.MARKETS:
            rows = naver_client.fetch_market_catalog(mkt, limit=limit)
            for row in rows:
                _upsert_row(conn, row)
                if row["type"] == "ETF":
                    etf_count += 1
            per_market[mkt] = len(rows)
            logger.info("Catalog synced %s: %d stocks", mkt, len(rows))

    total = sum(per_market.values())
    return {
        "kospi_count": per_market.get("KOSPI", 0),
        "kosdaq_count": per_market.get("KOSDAQ", 0),
        "etf_count": etf_count,
        "total_collected": total,
        "saved_count": total,
    }
