"""
Naver mobile API client for K-Growth Insights.

All market data (daily prices, investor trading flow, intraday bars) is sourced
from Naver's mobile JSON endpoints instead of scraping the desktop HTML pages:

- Daily price:   https://m.stock.naver.com/api/stock/{code}/price
- Trading flow:  https://m.stock.naver.com/api/stock/{code}/trend?trendType=1
- Intraday bars: https://api.stock.naver.com/chart/domestic/item/{code}/minute
- Basic info:    https://m.stock.naver.com/api/stock/{code}/basic

The functions here return *normalized* dicts (ISO dates, plain ints/floats) so
the rest of the app never deals with Naver's string/comma/sign formatting.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

MSTOCK_BASE = "https://m.stock.naver.com/api/stock"
CHART_BASE = "https://api.stock.naver.com/chart/domestic/item"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://m.stock.naver.com",
}

# Naver mobile API rejects pageSize > 60 with a 400.
MAX_PAGE_SIZE = 60
DEFAULT_TIMEOUT = 10.0


def _client() -> httpx.Client:
    return httpx.Client(headers=HEADERS, timeout=DEFAULT_TIMEOUT)


def _to_int(value) -> Optional[int]:
    """'+1,129,083' / '-826,076' / '1,877,021' / 61018 -> int (None if blank)."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    cleaned = str(value).replace(",", "").replace("+", "").strip()
    if cleaned in ("", "-"):
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def _to_float(value) -> Optional[float]:
    """'6.56' / '+6.56' / '46.59%' -> float (None if blank)."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).replace(",", "").replace("+", "").replace("%", "").strip()
    if cleaned in ("", "-"):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _bizdate_to_iso(bizdate: str) -> str:
    """'20260721' -> '2026-07-21'."""
    s = str(bizdate)
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"


def _localdatetime_to_iso(value: str) -> str:
    """'20260721090000' -> '2026-07-21T09:00:00'."""
    s = str(value)
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}T{s[8:10]}:{s[10:12]}:{s[12:14]}"


def fetch_stock_basic(code: str) -> Optional[dict]:
    """Current snapshot: name, exchange, close price, change, change pct."""
    url = f"{MSTOCK_BASE}/{code}/basic"
    try:
        with _client() as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_stock_basic(%s) failed: %s", code, exc)
        return None

    return {
        "ticker": data.get("itemCode", code),
        "name": data.get("stockName"),
        "exchange": data.get("stockExchangeName"),
        "close_price": _to_float(data.get("closePrice")),
        "change": _to_float(data.get("compareToPreviousClosePrice")),
        "change_pct": _to_float(data.get("fluctuationsRatio")),
        "end_type": data.get("stockEndType"),  # 'stock' or 'etf'
    }


def fetch_daily_prices(code: str, pages: int = 1) -> list[dict]:
    """
    Daily OHLCV, newest first.

    Each row: {date, open_price, high_price, low_price, close_price, volume,
               change_pct}
    """
    rows: list[dict] = []
    try:
        with _client() as client:
            for page in range(1, pages + 1):
                url = f"{MSTOCK_BASE}/{code}/price"
                resp = client.get(url, params={"pageSize": MAX_PAGE_SIZE, "page": page})
                resp.raise_for_status()
                items = resp.json()
                if not items:
                    break
                for it in items:
                    rows.append(
                        {
                            "date": it.get("localTradedAt"),
                            "open_price": _to_float(it.get("openPrice")),
                            "high_price": _to_float(it.get("highPrice")),
                            "low_price": _to_float(it.get("lowPrice")),
                            "close_price": _to_float(it.get("closePrice")),
                            "volume": _to_int(it.get("accumulatedTradingVolume")),
                            "change_pct": _to_float(it.get("fluctuationsRatio")),
                        }
                    )
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_daily_prices(%s) failed: %s", code, exc)
    return rows


def fetch_trading_flow(code: str, pages: int = 1) -> list[dict]:
    """
    Investor trading flow (net buy quantities), newest first.

    Unlike the legacy desktop scrape, the mobile API returns the *actual*
    individual net (individualPureBuyQuant) rather than deriving it as
    -(institutional + foreign), so 개인 순매수 is exact here.

    Each row: {date, individual_net, institutional_net, foreign_net,
               foreign_hold_ratio}
    """
    rows: list[dict] = []
    try:
        with _client() as client:
            for page in range(1, pages + 1):
                url = f"{MSTOCK_BASE}/{code}/trend"
                resp = client.get(
                    url, params={"trendType": 1, "pageSize": 20, "page": page}
                )
                resp.raise_for_status()
                items = resp.json()
                if not items:
                    break
                for it in items:
                    rows.append(
                        {
                            "date": _bizdate_to_iso(it.get("bizdate")),
                            "individual_net": _to_int(it.get("individualPureBuyQuant")),
                            "institutional_net": _to_int(it.get("organPureBuyQuant")),
                            "foreign_net": _to_int(it.get("foreignerPureBuyQuant")),
                            "foreign_hold_ratio": _to_float(it.get("foreignerHoldRatio")),
                        }
                    )
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_trading_flow(%s) failed: %s", code, exc)
    return rows


def fetch_intraday(code: str) -> list[dict]:
    """
    Minute bars for the latest trading session, chronological order.

    `accumulatedTradingVolume` in this endpoint is per-bar volume (it rises and
    falls between bars), so it is used directly as the bar volume.

    Each row: {datetime, open_price, high_price, low_price, price, volume}
    """
    url = f"{CHART_BASE}/{code}/minute"
    try:
        with _client() as client:
            resp = client.get(url)
            resp.raise_for_status()
            items = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_intraday(%s) failed: %s", code, exc)
        return []

    rows: list[dict] = []
    for it in items:
        rows.append(
            {
                "datetime": _localdatetime_to_iso(it.get("localDateTime")),
                "open_price": _to_float(it.get("openPrice")),
                "high_price": _to_float(it.get("highPrice")),
                "low_price": _to_float(it.get("lowPrice")),
                "price": _to_float(it.get("currentPrice")),
                "volume": _to_int(it.get("accumulatedTradingVolume")),
            }
        )
    return rows
