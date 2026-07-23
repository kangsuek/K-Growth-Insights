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

import html
import logging
import re
from email.utils import parsedate_to_datetime
from typing import Optional

import httpx

from app import config

logger = logging.getLogger(__name__)

MSTOCK_BASE = "https://m.stock.naver.com/api/stock"
MSTOCKS_BASE = "https://m.stock.naver.com/api/stocks"
MINDEX_BASE = "https://m.stock.naver.com/api/index"
CHART_BASE = "https://api.stock.naver.com/chart/domestic/item"
# 뉴스는 시장 데이터가 아니라 네이버 공식 검색 API(JSON)를 사용한다.
SEARCH_NEWS_URL = "https://openapi.naver.com/v1/search/news.json"

# 카탈로그 수집 대상 시장. 네이버 URL 세그먼트 그대로 사용.
MARKETS = ("KOSPI", "KOSDAQ")

# 시장 지수 코드 → 한글명. 대시보드 시장현황에 사용.
INDEX_NAMES = {"KOSPI": "코스피", "KOSDAQ": "코스닥"}
# 지수 차트 기간 → 수집할 거래일 수(대략치).
INDEX_PERIOD_COUNT = {"1M": 25, "3M": 70, "6M": 135, "1Y": 260, "3Y": 780}

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


def _flow_row(it: dict) -> dict:
    return {
        "date": _bizdate_to_iso(it.get("bizdate")),
        "individual_net": _to_int(it.get("individualPureBuyQuant")),
        "institutional_net": _to_int(it.get("organPureBuyQuant")),
        "foreign_net": _to_int(it.get("foreignerPureBuyQuant")),
        "foreign_hold_ratio": _to_float(it.get("foreignerHoldRatio")),
    }


# 매매동향 bizdate 역페이지네이션 안전 상한(각 호출 ~10건, 60회 ≈ 2.5년).
_FLOW_MAX_PAGES = 60


def fetch_trading_flow(code: str, pages: int = 1, days: int | None = None) -> list[dict]:
    """
    Investor trading flow (net buy quantities), newest first.

    모바일 trend API는 한 번에 최근 ~10~20건만 반환한다. days가 주어지면 `bizdate`
    파라미터로 과거 창을 뒤로 페이지네이션해 해당 일수만큼의 이력을 모은다(모바일
    API만 사용, 데스크톱 HTML 스크래핑 없음).

    Each row: {date, individual_net, institutional_net, foreign_net,
               foreign_hold_ratio}
    """
    url = f"{MSTOCK_BASE}/{code}/trend"
    rows: list[dict] = []
    seen: set[str] = set()
    try:
        with _client() as client:
            if days is None:
                # 기존 동작: 최근 1회 창.
                resp = client.get(url, params={"trendType": 1})
                resp.raise_for_status()
                for it in resp.json() or []:
                    rows.append(_flow_row(it))
                return rows

            from datetime import date, timedelta
            target_start = (date.today() - timedelta(days=days)).strftime("%Y%m%d")
            bizdate: str | None = None
            for _ in range(_FLOW_MAX_PAGES):
                params = {"trendType": 1}
                if bizdate:
                    params["bizdate"] = bizdate
                resp = client.get(url, params=params)
                resp.raise_for_status()
                items = resp.json() or []
                if not items:
                    break
                oldest = None
                new_count = 0
                for it in items:
                    bd = it.get("bizdate")
                    if not bd or bd in seen:
                        continue
                    seen.add(bd)
                    new_count += 1
                    rows.append(_flow_row(it))
                    if oldest is None or bd < oldest:
                        oldest = bd
                if new_count == 0 or oldest is None or oldest <= target_start:
                    break
                bizdate = oldest  # 그 이전 창으로 이동
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_trading_flow(%s) failed: %s", code, exc)
    return rows


def _parse_minute_bars(items) -> list[dict]:
    """분봉 원본 배열을 정규화. accumulatedTradingVolume은 분당 거래량이다."""
    rows: list[dict] = []
    for it in items or []:
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


def _latest_trading_date(code: str) -> Optional[str]:
    """가장 최근 거래일을 YYYYMMDD로 반환(일별 시세 최상단). 실패 시 None."""
    prices = fetch_daily_prices(code, pages=1)
    if not prices:
        return None
    # fetch_daily_prices는 최신순이므로 첫 행이 최근 거래일. date는 'YYYY-MM-DD'.
    date = prices[0].get("date")
    return date.replace("-", "") if date else None


def fetch_intraday(code: str) -> list[dict]:
    """
    Minute bars for the latest trading session, chronological order.

    장 시작 전이라 당일 분봉이 아직 없으면(빈 응답) 직전 거래일 분봉으로 폴백한다.
    `accumulatedTradingVolume` in this endpoint is per-bar volume (it rises and
    falls between bars), so it is used directly as the bar volume.

    Each row: {datetime, open_price, high_price, low_price, price, volume}
    """
    url = f"{CHART_BASE}/{code}/minute"
    try:
        with _client() as client:
            resp = client.get(url)
            resp.raise_for_status()
            rows = _parse_minute_bars(resp.json())
            if rows:
                return rows

            # 당일 세션이 비었으면 직전 거래일 09:00~16:00 구간으로 재요청.
            date = _latest_trading_date(code)
            if not date:
                return []
            resp = client.get(
                url,
                params={
                    "startDateTime": f"{date}0900",
                    "endDateTime": f"{date}1600",
                },
            )
            resp.raise_for_status()
            return _parse_minute_bars(resp.json())
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_intraday(%s) failed: %s", code, exc)
        return []


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


# 장중 순위 변동으로 페이지 경계 종목이 중복/누락될 때, totalCount에 도달할 때까지
# 전체 페이지를 다시 훑는 보충 조회 최대 횟수.
_CATALOG_REFETCH_MAX = 4


def fetch_market_catalog(market: str, limit: int | None = None) -> list[dict]:
    """시장 전체 종목 카탈로그: stocks/marketValue/{market} 페이지네이션 수집.

    limit=None이면 해당 시장의 **전체 종목**을 수집한다. 응답의 `totalCount`(네이버
    기준 종목 수)를 목표로 삼고, 장중 시총 순위 변동으로 페이지 경계 종목이
    누락되면 목표에 도달할 때까지 전체 페이지를 보충 재조회한다. ticker 기준으로
    중복을 제거하므로 수집 건수가 매번 흔들리지 않는다.
    limit이 주어지면 그 개수까지만 수집한다(발굴 상위 N, 보충 없음).
    각 행: {ticker, name, type('STOCK'|'ETF'), exchange('KOSPI'|'KOSDAQ')}
    """
    if market not in MARKETS:
        raise ValueError(f"지원하지 않는 시장: {market}")

    url = f"{MSTOCKS_BASE}/marketValue/{market}"

    def _parse(it: dict) -> dict | None:
        code = it.get("itemCode")
        if not code:
            return None
        # marketValue 응답에는 현재가·등락률·거래량·시총이 이미 들어 있어 그대로 캡처한다
        # (종목목록수집만으로 스크리닝 스냅샷 확보 → 종목별 재조회 불필요).
        return {
            "ticker": code,
            "name": it.get("stockName"),
            "type": "ETF" if it.get("stockEndType") == "etf" else "STOCK",
            "exchange": market,
            "close_price": _to_float(it.get("closePriceRaw")),
            "daily_change_pct": _to_float(it.get("fluctuationsRatio")),
            "volume": _to_int(it.get("accumulatedTradingVolumeRaw")),
            "market_value": _to_int(it.get("marketValueRaw")),
        }

    by_ticker: dict[str, dict] = {}  # ticker 기준 중복 제거
    total_count = 0
    try:
        with _client() as client:
            def _fetch_page(page: int) -> tuple[list[dict], int]:
                resp = client.get(url, params={"page": page, "pageSize": MAX_PAGE_SIZE})
                resp.raise_for_status()
                body = resp.json()
                return (body.get("stocks") or []), int(body.get("totalCount") or 0)

            def _pass() -> None:
                """전체(또는 limit까지) 페이지를 한 번 훑어 by_ticker에 병합한다."""
                nonlocal total_count
                page = 1
                while True:
                    items, tc = _fetch_page(page)
                    total_count = tc or total_count
                    if not items:
                        break
                    for it in items:
                        row = _parse(it)
                        if row:
                            by_ticker[row["ticker"]] = row
                    # limit 도달 또는 마지막(부분) 페이지면 종료.
                    if limit is not None and len(by_ticker) >= limit:
                        break
                    if len(items) < MAX_PAGE_SIZE:
                        break
                    page += 1

            _pass()

            # 전체 수집(limit=None)만: 장중 순위 변동으로 totalCount에 못 미치면
            # 새 종목이 더 잡히지 않을 때까지 전체 페이지를 보충 재조회한다.
            if limit is None:
                for _ in range(_CATALOG_REFETCH_MAX):
                    if not total_count or len(by_ticker) >= total_count:
                        break
                    before = len(by_ticker)
                    _pass()
                    if len(by_ticker) == before:  # 더 이상 새 종목 없음 → 수렴
                        break
                if total_count and len(by_ticker) < total_count:
                    logger.warning(
                        "fetch_market_catalog(%s): 네이버 %d건 중 %d건만 수집(순위 변동 누락)",
                        market, total_count, len(by_ticker),
                    )
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_market_catalog(%s) failed: %s", market, exc)

    rows = list(by_ticker.values())
    return rows[:limit] if limit is not None else rows


_TAG_RE = re.compile(r"<[^>]+>")


def _clean_html(text: Optional[str]) -> Optional[str]:
    """검색 API 결과의 <b> 태그·HTML 엔티티를 제거해 순수 텍스트로 만든다."""
    if not text:
        return text
    return html.unescape(_TAG_RE.sub("", text)).strip()


def _pubdate_to_iso(value: Optional[str]) -> Optional[str]:
    """RFC 2822 pubDate('Mon, 21 Jul 2026 09:00:00 +0900') → ISO8601. 실패 시 원문."""
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).isoformat()
    except (TypeError, ValueError):
        return value


def fetch_news(query: str, display: int = 10) -> list[dict]:
    """네이버 검색 API로 종목 뉴스 조회(최신순). 키 미설정 시 빈 리스트.

    각 행: {title, link, description, pub_date}  (태그 제거·날짜 ISO 정규화)
    """
    if not config.naver_search_enabled():
        return []

    headers = {
        "X-Naver-Client-Id": config.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": config.NAVER_CLIENT_SECRET,
    }
    params = {"query": query, "display": display, "sort": "date"}
    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT) as client:
            resp = client.get(SEARCH_NEWS_URL, params=params, headers=headers)
            resp.raise_for_status()
            items = resp.json().get("items") or []
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_news(%s) failed: %s", query, exc)
        return []

    rows: list[dict] = []
    for it in items:
        link = it.get("originallink") or it.get("link")
        if not link:
            continue
        rows.append(
            {
                "title": _clean_html(it.get("title")),
                "link": link,
                "description": _clean_html(it.get("description")),
                "pub_date": _pubdate_to_iso(it.get("pubDate")),
            }
        )
    return rows


def fetch_index_basic(code: str) -> Optional[dict]:
    """시장 지수 현황: index/{code}/basic. 반환 {code, name, close_price, change, change_ratio}."""
    if code not in INDEX_NAMES:
        raise ValueError(f"지원하지 않는 지수: {code}")
    url = f"{MINDEX_BASE}/{code}/basic"
    try:
        with _client() as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_index_basic(%s) failed: %s", code, exc)
        return None

    return {
        "code": code,
        "name": INDEX_NAMES.get(code, code),
        "close_price": _to_float(data.get("closePrice")),
        "change": _to_float(data.get("compareToPreviousClosePrice")),
        "change_ratio": _to_float(data.get("fluctuationsRatio")),
    }


def fetch_index_chart(code: str, period: str = "3M") -> list[dict]:
    """시장 지수 일별 차트: index/{code}/price 페이지네이션(오래된→최신 순 반환).

    각 행: {date, open_price, high_price, low_price, close_price, volume}
    """
    if code not in INDEX_NAMES:
        raise ValueError(f"지원하지 않는 지수: {code}")
    count = INDEX_PERIOD_COUNT.get(period, 70)
    rows: list[dict] = []
    url = f"{MINDEX_BASE}/{code}/price"
    try:
        with _client() as client:
            page = 1
            while len(rows) < count:
                resp = client.get(url, params={"page": page, "pageSize": MAX_PAGE_SIZE})
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
                        }
                    )
                if len(items) < MAX_PAGE_SIZE:
                    break
                page += 1
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("fetch_index_chart(%s) failed: %s", code, exc)
        return []

    rows = rows[:count]
    rows.reverse()  # 최신순 수신 → 차트용 오래된→최신
    return rows
