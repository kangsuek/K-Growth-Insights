"""시총 상위 종목 카탈로그를 네이버 API에서 수집해 stocks 테이블로 자동 확장.

config/stocks.json 수기 목록(stocks_sync)을 넘어, KOSPI·KOSDAQ 시가총액
상위 N 종목을 추적 대상에 추가한다. 기존 종목의 수기 theme는 보존한다.
"""
from __future__ import annotations

import logging

from app.database import get_connection
from app.services import naver_client

logger = logging.getLogger(__name__)


def sync_catalog(market: str | None = None, limit: int = 100) -> dict:
    """시장별 시총 상위 limit 종목을 stocks 테이블에 upsert.

    market이 None이면 KOSPI·KOSDAQ 모두 수집한다. 반환: {시장: 반영 건수}.
    theme은 수기 목록 값을 덮어쓰지 않도록 갱신 대상에서 제외한다.
    """
    markets = (market,) if market else naver_client.MARKETS
    result: dict[str, int] = {}

    with get_connection() as conn:
        for mkt in markets:
            rows = naver_client.fetch_market_catalog(mkt, limit=limit)
            for row in rows:
                conn.execute(
                    """
                    INSERT INTO stocks (ticker, name, type, updated_at)
                    VALUES (?, ?, ?, datetime('now'))
                    ON CONFLICT(ticker) DO UPDATE SET
                        name=excluded.name,
                        type=excluded.type,
                        updated_at=excluded.updated_at
                    """,
                    (row["ticker"], row["name"] or row["ticker"], row["type"]),
                )
            result[mkt] = len(rows)
            logger.info("Catalog synced %s: %d stocks", mkt, len(rows))

    return result
