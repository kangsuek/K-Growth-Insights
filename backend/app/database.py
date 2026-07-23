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
    ticker              TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    type                TEXT NOT NULL DEFAULT 'STOCK',   -- STOCK | ETF
    theme               TEXT,
    purchase_date       TEXT,      -- 구매일(YYYY-MM-DD, 선택)
    purchase_price      REAL,      -- 매입 평균가(선택)
    quantity            INTEGER,   -- 보유 수량(선택)
    search_keyword      TEXT,      -- 뉴스 검색 키워드(선택)
    relevance_keywords  TEXT,      -- 관련 키워드 JSON 배열(선택)
    sort_order          INTEGER,   -- 사용자 지정 정렬 순서
    updated_at          TEXT DEFAULT (datetime('now'))
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

-- 종목 발굴(Screening)용 전체 종목 카탈로그(유니버스). 워치리스트(stocks)와 별개.
-- '종목목록수집'이 KOSPI/KOSDAQ 시총 상위 종목을 이 테이블에 적재한다.
CREATE TABLE IF NOT EXISTS stock_catalog (
    ticker             TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    type               TEXT NOT NULL DEFAULT 'STOCK',   -- STOCK | ETF
    market             TEXT,      -- KOSPI | KOSDAQ
    sector             TEXT,      -- 섹터/테마(발굴 그룹핑)
    is_active          INTEGER DEFAULT 1,
    market_value       INTEGER,   -- 시가총액(상위 N 선별용, 종목목록수집 시 스냅샷)
    close_price        REAL,      -- 최신 종가(스크리닝용 스냅샷)
    daily_change_pct   REAL,
    volume             INTEGER,
    weekly_return      REAL,      -- 주간 수익률
    monthly_return     REAL,      -- 월간 수익률
    ytd_return         REAL,      -- 연초대비 수익률
    ytd_base_date      TEXT,      -- YTD 기준일(올해 첫 거래일) — 딥페이징 캐시
    ytd_base_price     REAL,      -- YTD 기준가
    foreign_net        INTEGER,   -- 최근 외국인 순매수
    institutional_net  INTEGER,   -- 최근 기관 순매수
    catalog_updated_at TEXT,      -- 지표 갱신 시각
    updated_at         TEXT DEFAULT (datetime('now'))
);

-- 종목 뉴스: 네이버 검색 API. link를 종목 내 고유키로 사용해 중복을 막는다.
CREATE TABLE IF NOT EXISTS news (
    ticker      TEXT NOT NULL,
    title       TEXT NOT NULL,
    link        TEXT NOT NULL,
    description TEXT,
    pub_date    TEXT,   -- ISO8601 (파싱 실패 시 원문 문자열)
    updated_at  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (ticker, link)
);

-- 가격 알림 규칙: 종목별 목표가/방향 등. 트리거 이력은 alert_history.
CREATE TABLE IF NOT EXISTS alert_rules (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker            TEXT NOT NULL,
    alert_type        TEXT NOT NULL,   -- buy | sell | price_change | trading_signal
    direction         TEXT NOT NULL,   -- above | below | both
    target_price      REAL NOT NULL,
    memo              TEXT,
    is_active         INTEGER DEFAULT 1,
    created_at        TEXT DEFAULT (datetime('now')),
    last_triggered_at TEXT
);
CREATE TABLE IF NOT EXISTS alert_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id      INTEGER,
    ticker       TEXT NOT NULL,
    alert_type   TEXT,
    message      TEXT,
    triggered_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prices_ticker_date
    ON prices (ticker, date DESC);
CREATE INDEX IF NOT EXISTS idx_news_ticker_date
    ON news (ticker, pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_alert_rules_ticker
    ON alert_rules (ticker, is_active);
CREATE INDEX IF NOT EXISTS idx_flow_ticker_date
    ON trading_flow (ticker, date DESC);
CREATE INDEX IF NOT EXISTS idx_intraday_ticker_dt
    ON intraday_prices (ticker, datetime);
"""


@contextmanager
def get_connection():
    """Yield a SQLite connection with row access by column name.

    병렬 수집(collect-all)에서 여러 스레드가 동시에 쓰기를 시도하므로 WAL 모드와
    busy_timeout으로 잠금 대기를 허용해 'database is locked' 오류를 피한다.
    """
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# 기존 stocks 테이블에 나중에 추가된 컬럼(구버전 DB 마이그레이션용).
_STOCKS_ADDED_COLUMNS = {
    "purchase_date": "TEXT",
    "purchase_price": "REAL",
    "quantity": "INTEGER",
    "search_keyword": "TEXT",
    "relevance_keywords": "TEXT",
    "sort_order": "INTEGER",
}


# 기존 stock_catalog에 나중에 추가된 스크리닝 컬럼(구버전 DB 마이그레이션용).
_CATALOG_ADDED_COLUMNS = {
    "sector": "TEXT",
    "is_active": "INTEGER DEFAULT 1",
    "market_value": "INTEGER",
    "close_price": "REAL",
    "daily_change_pct": "REAL",
    "volume": "INTEGER",
    "weekly_return": "REAL",
    "monthly_return": "REAL",
    "ytd_return": "REAL",
    "ytd_base_date": "TEXT",
    "ytd_base_price": "REAL",
    "foreign_net": "INTEGER",
    "institutional_net": "INTEGER",
    "catalog_updated_at": "TEXT",
}


def _migrate(conn) -> None:
    """기존 DB에 없는 컬럼을 추가한다(멱등). SQLite는 컬럼 IF NOT EXISTS가 없어 직접 확인."""
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(stocks)")}
    for col, coltype in _STOCKS_ADDED_COLUMNS.items():
        if col not in existing:
            conn.execute(f"ALTER TABLE stocks ADD COLUMN {col} {coltype}")
            logger.info("Migrated: added stocks.%s", col)
    cat_existing = {row["name"] for row in conn.execute("PRAGMA table_info(stock_catalog)")}
    if cat_existing:  # 테이블이 이미 있는 경우에만 컬럼 보강
        for col, coltype in _CATALOG_ADDED_COLUMNS.items():
            if col not in cat_existing:
                conn.execute(f"ALTER TABLE stock_catalog ADD COLUMN {col} {coltype}")
                logger.info("Migrated: added stock_catalog.%s", col)


def init_db() -> None:
    """Create tables/indexes if they do not exist (idempotent)."""
    Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        # WAL 모드: 읽기와 쓰기 동시성 향상(병렬 수집 시 잠금 경합 감소).
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        _migrate(conn)  # 스크리닝 컬럼 보강 후에 인덱스 생성
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_catalog_screening "
            "ON stock_catalog (type, is_active, weekly_return)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_catalog_sector ON stock_catalog (sector, is_active)"
        )
    logger.info("Database initialized at %s", DATABASE_PATH)
