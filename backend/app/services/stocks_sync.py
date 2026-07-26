"""config/stocks.json으로 추적 종목을 최초 1회 시딩한다.

stocks.json은 '부트스트랩 목록'이고, 이후 추적 종목의 실제 소스는 DB다
(화면에서 추가·수정·삭제한 결과가 DB에만 남는다). 그래서 앱이 뜰 때마다
stocks.json을 전체 UPSERT하면 사용자가 삭제한 종목이 계속 되살아난다.
시딩은 stocks 테이블이 비어 있을 때(최초 실행·초기화 직후)만 한다.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from app.config import STOCKS_CONFIG_PATH
from app.database import get_connection

logger = logging.getLogger(__name__)


def load_config() -> list[dict]:
    path = Path(STOCKS_CONFIG_PATH)
    if not path.exists():
        logger.warning("stocks config not found at %s", path)
        return []
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def seed_stocks_if_empty() -> int:
    """stocks 테이블이 비어 있을 때만 stocks.json으로 시딩한다. 넣은 건수 반환.

    이미 종목이 하나라도 있으면 아무것도 하지 않는다(0 반환). 사용자가 삭제한
    종목이 재시작 때 되살아나지 않게 하려는 것이 이 조건의 목적이다.
    네트워크는 쓰지 않는다(부팅을 네이버 응답에 묶지 않기 위해).
    """
    with get_connection() as conn:
        if conn.execute("SELECT 1 FROM stocks LIMIT 1").fetchone():
            logger.info("Stock seeding skipped: 이미 등록된 종목이 있다")
            return 0

    entries = load_config()
    if not entries:
        return 0

    with get_connection() as conn:
        for entry in entries:
            conn.execute(
                """
                INSERT INTO stocks (ticker, name, type, theme, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(ticker) DO NOTHING
                """,
                (
                    entry["ticker"],
                    entry.get("name") or entry["ticker"],
                    entry.get("type", "STOCK"),
                    entry.get("theme"),
                ),
            )
    logger.info("Seeded %d stocks", len(entries))
    return len(entries)
