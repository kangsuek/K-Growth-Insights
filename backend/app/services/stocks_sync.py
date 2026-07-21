"""Sync the tracked ticker list from config/stocks.json into the DB.

Names and STOCK/ETF type are refreshed from the Naver basic API when reachable,
so the catalog stays correct even if stocks.json only lists tickers + theme.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from app.config import STOCKS_CONFIG_PATH
from app.database import get_connection
from app.services import naver_client

logger = logging.getLogger(__name__)


def load_config() -> list[dict]:
    path = Path(STOCKS_CONFIG_PATH)
    if not path.exists():
        logger.warning("stocks config not found at %s", path)
        return []
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def sync_stocks(refresh_from_api: bool = True) -> int:
    entries = load_config()
    if not entries:
        return 0

    with get_connection() as conn:
        for entry in entries:
            ticker = entry["ticker"]
            name = entry.get("name")
            type_ = entry.get("type", "STOCK")
            theme = entry.get("theme")

            if refresh_from_api:
                basic = naver_client.fetch_stock_basic(ticker)
                if basic:
                    name = basic.get("name") or name
                    end_type = basic.get("end_type")
                    if end_type == "etf":
                        type_ = "ETF"
                    elif end_type == "stock":
                        type_ = "STOCK"

            conn.execute(
                """
                INSERT INTO stocks (ticker, name, type, theme, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(ticker) DO UPDATE SET
                    name=excluded.name,
                    type=excluded.type,
                    theme=excluded.theme,
                    updated_at=excluded.updated_at
                """,
                (ticker, name or ticker, type_, theme),
            )
    logger.info("Synced %d stocks", len(entries))
    return len(entries)
