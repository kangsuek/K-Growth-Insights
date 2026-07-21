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

-- 주식 요약 펀더멘털: 종목당 최신 스냅샷 1건 (히스토리 시계열 아님)
CREATE TABLE IF NOT EXISTS stock_fundamentals (
    ticker         TEXT PRIMARY KEY,
    per            REAL,
    pbr            REAL,
    eps            REAL,
    bps            REAL,
    est_per        REAL,
    est_eps        REAL,
    dividend_yield REAL,
    dividend       REAL,
    foreign_rate   REAL,
    high_52w       REAL,
    low_52w        REAL,
    market_value   TEXT,   -- '1,514조 1,862억' 형태의 표시용 문자열
    updated_at     TEXT DEFAULT (datetime('now'))
);

-- ETF 핵심지표: 종목당 최신 스냅샷 1건
CREATE TABLE IF NOT EXISTS etf_fundamentals (
    ticker         TEXT PRIMARY KEY,
    issuer_name    TEXT,
    market_value   TEXT,   -- 조/억 표기 표시용 문자열
    nav            REAL,
    total_nav      TEXT,   -- 조/억 표기 표시용 문자열
    deviation_rate REAL,   -- 괴리율(부호 반영)
    total_fee      REAL,   -- 총보수(%)
    dividend_yield REAL,
    return_1m      REAL,
    return_3m      REAL,
    return_1y      REAL,
    updated_at     TEXT DEFAULT (datetime('now'))
);

-- ETF 구성종목 Top10: 종목당 최대 10행. 수집 시 전체 삭제 후 재삽입한다.
CREATE TABLE IF NOT EXISTS etf_holdings (
    ticker      TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    item_code   TEXT,
    item_name   TEXT,
    weight      REAL,   -- 편입 비중(%)
    updated_at  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (ticker, seq)
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
