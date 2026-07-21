"""SQLite connection helper and schema initialization."""
from __future__ import annotations

import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from app.config import DATABASE_PATH

logger = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS stocks (
    ticker      TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'STOCK',   -- STOCK | ETF
    theme       TEXT,
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prices (
    ticker        TEXT NOT NULL,
    date          TEXT NOT NULL,
    open_price    REAL,
    high_price    REAL,
    low_price     REAL,
    close_price   REAL,
    volume        INTEGER,
    change_pct    REAL,
    PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS trading_flow (
    ticker             TEXT NOT NULL,
    date               TEXT NOT NULL,
    individual_net     INTEGER,
    institutional_net  INTEGER,
    foreign_net        INTEGER,
    foreign_hold_ratio REAL,
    PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS intraday_prices (
    ticker      TEXT NOT NULL,
    datetime    TEXT NOT NULL,
    open_price  REAL,
    high_price  REAL,
    low_price   REAL,
    price       REAL,
    volume      INTEGER,
    PRIMARY KEY (ticker, datetime)
);

CREATE INDEX IF NOT EXISTS idx_prices_ticker_date
    ON prices (ticker, date DESC);
CREATE INDEX IF NOT EXISTS idx_flow_ticker_date
    ON trading_flow (ticker, date DESC);
CREATE INDEX IF NOT EXISTS idx_intraday_ticker_dt
    ON intraday_prices (ticker, datetime);
"""


@contextmanager
def get_connection():
    """Yield a SQLite connection with row access by column name."""
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Create tables/indexes if they do not exist (idempotent)."""
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.executescript(SCHEMA)
    logger.info("Database initialized at %s", DATABASE_PATH)
