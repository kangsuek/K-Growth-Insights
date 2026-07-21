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
import re
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


_NUM_RE = re.compile(r"[-+]?\d+(?:\.\d+)?")


def _num(value) -> Optional[float]:
    """단위·통화가 붙은 문자열에서 앞쪽 숫자만 추출.

    '20.93배' -> 20.93, '12,372원' -> 12372, '46.59%' -> 46.59,
    '31,971.60' -> 31971.6. (시총 '1,514조 1,862억'처럼 조/억 표기는
    앞 숫자만 잡히므로 이런 값은 텍스트 그대로 보관한다.)
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = _NUM_RE.search(str(value).replace(",", ""))
    return float(match.group()) if match else None


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


def fetch_stock_fundamentals(code: str) -> Optional[dict]:
    """주식 요약 펀더멘털: integration.totalInfos의 안정적 `code` 키로 파싱.

    반환: {per, pbr, eps, bps, est_per, est_eps, dividend_yield, dividend,
           foreign_rate, high_52w, low_52w, market_value}
    (market_value는 '1,514조 1,862억' 형태라 표시용 문자열로 그대로 둔다.)
    """
    url = f"{MSTOCK_BASE}/{code}/integration"
    try:
        with _client() as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_stock_fundamentals(%s) failed: %s", code, exc)
        return None

    infos = data.get("totalInfos") or []
    by_code = {i.get("code"): i.get("value") for i in infos}
    if not by_code:
        return None
    return {
        "per": _num(by_code.get("per")),
        "pbr": _num(by_code.get("pbr")),
        "eps": _num(by_code.get("eps")),
        "bps": _num(by_code.get("bps")),
        "est_per": _num(by_code.get("cnsPer")),
        "est_eps": _num(by_code.get("cnsEps")),
        "dividend_yield": _num(by_code.get("dividendYieldRatio")),
        "dividend": _num(by_code.get("dividend")),
        "foreign_rate": _num(by_code.get("foreignRate")),
        "high_52w": _num(by_code.get("highPriceOf52Weeks")),
        "low_52w": _num(by_code.get("lowPriceOf52Weeks")),
        "market_value": by_code.get("marketValue"),
    }


def fetch_etf_fundamentals(code: str) -> Optional[dict]:
    """ETF 핵심지표: integration.etfKeyIndicator 파싱.

    반환: {issuer_name, market_value, nav, total_nav, deviation_rate,
           total_fee, dividend_yield, return_1m, return_3m, return_1y}
    괴리율(deviation_rate)은 deviationSign('+'/'-')을 부호로 반영한다.
    market_value·total_nav는 조/억 표기라 문자열 그대로 둔다.
    """
    url = f"{MSTOCK_BASE}/{code}/integration"
    try:
        with _client() as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_etf_fundamentals(%s) failed: %s", code, exc)
        return None

    ind = data.get("etfKeyIndicator")
    if not ind:
        return None
    deviation = _num(ind.get("deviationRate"))
    if deviation is not None and ind.get("deviationSign") == "-":
        deviation = -deviation
    return {
        "issuer_name": ind.get("issuerName"),
        "market_value": ind.get("marketValue"),
        "nav": _num(ind.get("nav")),
        "total_nav": ind.get("totalNav"),
        "deviation_rate": deviation,
        "total_fee": _num(ind.get("totalFee")),
        "dividend_yield": _num(ind.get("dividendYieldTtm")),
        "return_1m": _num(ind.get("returnRate1m")),
        "return_3m": _num(ind.get("returnRate3m")),
        "return_1y": _num(ind.get("returnRate1y")),
    }


def fetch_etf_holdings(code: str) -> list[dict]:
    """ETF 구성종목 Top10: etfAnalysis.etfTop10MajorConstituentAssets 파싱.

    각 행: {seq, item_code, item_name, weight}  (weight는 % 숫자)
    """
    url = f"{MSTOCK_BASE}/{code}/etfAnalysis"
    try:
        with _client() as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_etf_holdings(%s) failed: %s", code, exc)
        return []

    items = data.get("etfTop10MajorConstituentAssets") or []
    rows: list[dict] = []
    for it in items:
        rows.append(
            {
                "seq": _to_int(it.get("seq")),
                "item_code": it.get("itemCode"),
                "item_name": it.get("itemName"),
                "weight": _num(it.get("etfWeight")),
            }
        )
    return rows
