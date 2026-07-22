"""투자 시뮬레이션 — 일시(lump-sum)·적립식(DCA)·포트폴리오. 원본 로직 재현.

시세는 repository.get_prices(오래된→최신)를 기간 필터해 사용한다.
"""
from __future__ import annotations

import calendar
from datetime import date

from app.services import repository


def _prices_in_range(ticker: str, start: str, end: str) -> list[dict]:
    rows = repository.get_prices(ticker, days=400)  # 오래된→최신
    return [p for p in rows if p.get("close_price") and start <= (p.get("date") or "") <= end]


def _nearest(prices: list[dict], target: str) -> dict | None:
    """target(YYYY-MM-DD) 이후 첫 거래일, 없으면 마지막 거래일."""
    after = [p for p in prices if (p.get("date") or "") >= target]
    if after:
        return after[0]
    return prices[-1] if prices else None


def _name(ticker: str) -> str:
    s = repository.get_stock(ticker)
    return s["name"] if s else ticker


# --- 일시 투자 ---------------------------------------------------------------

def lump_sum(ticker: str, buy_date: str, amount: float) -> dict:
    prices = _prices_in_range(ticker, buy_date, date.today().isoformat())
    if not prices:
        raise ValueError("해당 기간의 시세 데이터가 없습니다")
    buy_entry = _nearest(prices, buy_date)
    buy_price = buy_entry["close_price"]
    shares = int(amount // buy_price)
    if shares == 0:
        raise ValueError(f"투자금({amount:,.0f}원)으로 매수할 수 없습니다 (주가: {buy_price:,.0f}원)")
    remainder = amount - shares * buy_price

    series = [p for p in prices if p["date"] >= buy_entry["date"]]
    price_series = []
    max_gain = {"date": buy_entry["date"], "price": buy_price, "return_pct": 0.0}
    max_loss = {"date": buy_entry["date"], "price": buy_price, "return_pct": 0.0}
    for p in series:
        valuation = shares * p["close_price"] + remainder
        ret_pct = round((valuation - amount) / amount * 100, 2)
        price_series.append({
            "date": p["date"], "close_price": p["close_price"],
            "valuation": round(valuation), "return_pct": ret_pct,
        })
        if ret_pct > max_gain["return_pct"]:
            max_gain = {"date": p["date"], "price": p["close_price"], "return_pct": ret_pct}
        if ret_pct < max_loss["return_pct"]:
            max_loss = {"date": p["date"], "price": p["close_price"], "return_pct": ret_pct}

    last = series[-1]
    total_valuation = shares * last["close_price"] + remainder
    return {
        "ticker": ticker, "name": _name(ticker),
        "buy_date": buy_entry["date"], "buy_price": buy_price,
        "current_date": last["date"], "current_price": last["close_price"],
        "shares": shares, "remainder": round(remainder),
        "total_invested": amount, "total_valuation": round(total_valuation),
        "total_return_pct": round((total_valuation - amount) / amount * 100, 2),
        "max_gain": max_gain, "max_loss": max_loss, "price_series": price_series,
    }


# --- 적립식(DCA) -------------------------------------------------------------

def _add_month(d: date, buy_day: int) -> date:
    year, month = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    _, last = calendar.monthrange(year, month)
    return date(year, month, min(buy_day, last))


def dca(ticker: str, monthly_amount: float, start_date: str, end_date: str, buy_day: int = 1) -> dict:
    prices = _prices_in_range(ticker, start_date, end_date)
    if not prices:
        raise ValueError("해당 기간의 시세 데이터가 없습니다")

    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    _, last_day = calendar.monthrange(start.year, start.month)
    current = date(start.year, start.month, min(buy_day, last_day))

    monthly_data = []
    cum_shares = 0
    cum_invested = 0.0
    cum_remainder = 0.0
    total_cost = 0.0
    while current <= end:
        entry = _nearest(prices, current.isoformat())
        if entry:
            buy_price = entry["close_price"]
            shares_bought = int(monthly_amount // buy_price)
            if shares_bought > 0:
                cum_shares += shares_bought
                actual_cost = shares_bought * buy_price
                total_cost += actual_cost
                cum_invested += monthly_amount
                cum_remainder += (monthly_amount - actual_cost)
                valuation = cum_shares * buy_price + cum_remainder
                monthly_data.append({
                    "date": entry["date"], "buy_price": buy_price,
                    "shares_bought": shares_bought, "cumulative_shares": cum_shares,
                    "cumulative_invested": cum_invested,
                    "cumulative_valuation": round(valuation),
                    "return_pct": round((valuation - cum_invested) / cum_invested * 100, 2)
                    if cum_invested > 0 else 0.0,
                })
        current = _add_month(current, buy_day)

    if not monthly_data:
        raise ValueError("매수 가능한 월이 없습니다")

    last_price = prices[-1]["close_price"]
    total_valuation = cum_shares * last_price + cum_remainder
    return {
        "ticker": ticker, "name": _name(ticker),
        "total_invested": cum_invested, "total_valuation": round(total_valuation),
        "total_return_pct": round((total_valuation - cum_invested) / cum_invested * 100, 2)
        if cum_invested > 0 else 0.0,
        "avg_buy_price": round(total_cost / cum_shares) if cum_shares > 0 else 0.0,
        "total_shares": cum_shares, "monthly_data": monthly_data,
    }


# --- 포트폴리오 --------------------------------------------------------------

def portfolio(holdings: list[dict], amount: float, start_date: str, end_date: str) -> dict:
    """holdings: [{ticker, weight(0~1)}]. 비중대로 배분해 일시 매수 후 일별 평가."""
    per_ticker = {}
    date_set: set[str] = set()
    for h in holdings:
        ticker, weight = h["ticker"], h["weight"]
        prices = _prices_in_range(ticker, start_date, end_date)
        if not prices:
            continue
        buy_entry = _nearest(prices, start_date)
        alloc = amount * weight
        buy_price = buy_entry["close_price"]
        shares = int(alloc // buy_price)
        remainder = alloc - shares * buy_price
        series = {p["date"]: p["close_price"] for p in prices if p["date"] >= buy_entry["date"]}
        per_ticker[ticker] = {
            "weight": weight, "shares": shares, "remainder": remainder,
            "buy_price": buy_price, "invested": alloc, "series": series,
        }
        date_set.update(series.keys())

    if not per_ticker:
        raise ValueError("해당 기간의 시세 데이터가 없습니다")

    total_invested = sum(v["invested"] for v in per_ticker.values())
    dates = sorted(date_set)
    daily_series = []
    last_prices = {t: None for t in per_ticker}
    for d in dates:
        valuation = 0.0
        for t, v in per_ticker.items():
            price = v["series"].get(d, last_prices[t])
            if price is not None:
                last_prices[t] = price
                valuation += v["shares"] * price + v["remainder"]
        daily_series.append({
            "date": d, "valuation": round(valuation),
            "return_pct": round((valuation - total_invested) / total_invested * 100, 2)
            if total_invested > 0 else 0.0,
        })

    holdings_result = []
    for t, v in per_ticker.items():
        cur_price = last_prices[t] or v["buy_price"]
        cur_val = v["shares"] * cur_price + v["remainder"]
        holdings_result.append({
            "ticker": t, "name": _name(t), "weight": v["weight"],
            "shares": v["shares"], "invested": round(v["invested"]),
            "current_price": cur_price, "valuation": round(cur_val),
            "return_pct": round((cur_val - v["invested"]) / v["invested"] * 100, 2)
            if v["invested"] > 0 else 0.0,
        })

    total_valuation = daily_series[-1]["valuation"] if daily_series else total_invested
    return {
        "total_invested": round(total_invested), "total_valuation": total_valuation,
        "total_return_pct": round((total_valuation - total_invested) / total_invested * 100, 2)
        if total_invested > 0 else 0.0,
        "holdings_result": holdings_result, "daily_series": daily_series,
    }
