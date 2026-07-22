"""종목 비교(Comparison) — 정규화 가격·통계·상관관계.

원본 /etfs/compare 응답을 재현한다(순수 파이썬 계산):
{normalized_prices:{dates,data}, statistics:{ticker:{...}}, correlation_matrix:{tickers,matrix}}
"""
from __future__ import annotations

import math
from datetime import date, timedelta

from app.services import repository

TRADING_DAYS_PER_YEAR = 252
RISK_FREE_RATE = 3.0


def _daily_returns(values: list[float]) -> list[float]:
    return [(values[i] / values[i - 1] - 1) for i in range(1, len(values)) if values[i - 1]]


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    mean = sum(xs) / len(xs)
    return math.sqrt(sum((x - mean) ** 2 for x in xs) / len(xs))


def _correlation(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    if n < 2:
        return 0.0
    a, b = a[:n], b[:n]
    ma, mb = sum(a) / n, sum(b) / n
    cov = sum((a[i] - ma) * (b[i] - mb) for i in range(n))
    da = math.sqrt(sum((x - ma) ** 2 for x in a))
    db = math.sqrt(sum((x - mb) ** 2 for x in b))
    if da == 0 or db == 0:
        return 0.0
    return cov / (da * db)


def _statistics(closes: list[float]) -> dict:
    """기간·연환산 수익률, 변동성, 최대낙폭, 샤프."""
    n = len(closes)
    if n < 2 or not closes[0]:
        return {"period_return": None, "annualized_return": None, "volatility": None,
                "max_drawdown": None, "sharpe_ratio": None, "data_points": n}
    period_return = (closes[-1] / closes[0] - 1) * 100
    rets = _daily_returns(closes)
    volatility = _std(rets) * math.sqrt(TRADING_DAYS_PER_YEAR) * 100 if rets else None
    annualized = ((closes[-1] / closes[0]) ** (TRADING_DAYS_PER_YEAR / max(n - 1, 1)) - 1) * 100
    # 최대 낙폭
    peak = closes[0]
    max_dd = 0.0
    for c in closes:
        peak = max(peak, c)
        if peak:
            max_dd = min(max_dd, (c - peak) / peak * 100)
    sharpe = None
    if volatility and volatility > 0:
        sharpe = round((annualized - RISK_FREE_RATE) / volatility, 2)
    return {
        "period_return": round(period_return, 2),
        "annualized_return": round(annualized, 2),
        "volatility": round(volatility, 2) if volatility is not None else None,
        "max_drawdown": round(max_dd, 2),
        "sharpe_ratio": sharpe,
        "data_points": n,
    }


def compare(ticker_list: list[str], start: str | None, end: str | None) -> dict:
    """여러 종목의 정규화 가격·통계·상관관계를 계산."""
    today = date.today()
    end = end or today.isoformat()
    start = start or (today - timedelta(days=30)).isoformat()

    # 종목별 {date: close} (기간 필터)
    series: dict[str, dict] = {}
    for t in ticker_list:
        prices = repository.get_prices(t, days=400)  # 오래된→최신
        m = {p["date"]: p["close_price"] for p in prices
             if p.get("close_price") and start <= (p.get("date") or "") <= end}
        if m:
            series[t] = m

    valid = list(series.keys())
    if not valid:
        return {"normalized_prices": {"dates": [], "data": {}},
                "statistics": {}, "correlation_matrix": {"tickers": [], "matrix": []}}

    # 공통 날짜(교집합) 정렬 — 정규화·상관관계 정렬축.
    common = sorted(set.intersection(*[set(series[t]) for t in valid])) if len(valid) > 1 \
        else sorted(series[valid[0]])

    normalized: dict[str, list[float]] = {}
    statistics: dict[str, dict] = {}
    returns_by_ticker: dict[str, list[float]] = {}
    for t in valid:
        closes = [series[t][d] for d in common] if common else []
        base = closes[0] if closes else None
        if base:
            normalized[t] = [round(c / base * 100, 2) for c in closes]
            returns_by_ticker[t] = _daily_returns(closes)
        statistics[t] = _statistics(closes)

    # 상관관계 행렬(일일 수익률 기준)
    matrix = []
    for a in valid:
        row = []
        for b in valid:
            if a == b:
                row.append(1.0)
            else:
                row.append(round(_correlation(returns_by_ticker.get(a, []),
                                               returns_by_ticker.get(b, [])), 2))
        matrix.append(row)

    return {
        "normalized_prices": {"dates": common, "data": normalized},
        "statistics": statistics,
        "correlation_matrix": {"tickers": valid, "matrix": matrix},
    }
