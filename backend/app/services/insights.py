"""종목 인사이트 — ETFWeeklyReport insights_service 로직을 그대로 재현.

수익률(1w/1m/ytd)·변동성 기반 전략(단/중/장기·추천·코멘트)과 핵심 포인트·리스크를
산출한다. 매매동향 판정은 최근 N거래일 외국인 순매수 합계를 평균 거래량 대비 비율로
스케일링한다(단일일·고정 임계값 금지). 응답 형태: {strategy, key_points, risks}.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

from app.services import repository

# 외국인 '대규모 순매수/매도 지속' 판정 파라미터(원본과 동일).
FOREIGN_NET_SUSTAINED_DAYS = 5
FOREIGN_NET_AVG_VOLUME_WINDOW = 20
FOREIGN_NET_SUSTAINED_VOLUME_RATIO = 0.05
FOREIGN_NET_SUSTAINED_FALLBACK_THRESHOLD = 1000
TRADING_DAYS_PER_YEAR = 252
RISK_KEYWORDS = ["규제", "관세", "금리", "환율", "경기", "리스크"]


# --- 지표(수익률·변동성) -----------------------------------------------------

def _compute_metrics(prices_desc: list[dict]) -> tuple[dict, float | None]:
    """최신순 시세로 returns(1w/1m/ytd)·연환산 변동성 계산(원본 get_etf_metrics 동일)."""
    n = len(prices_desc)
    returns: dict[str, float | None] = {"1w": None, "1m": None, "ytd": None}

    def _ret(base_idx: int) -> float | None:
        cur = prices_desc[0]["close_price"]
        base = prices_desc[base_idx]["close_price"]
        if cur and base:
            return (cur - base) / base * 100
        return None

    if n >= 5:
        returns["1w"] = _ret(min(4, n - 1))
    if n >= 20:
        returns["1m"] = _ret(min(19, n - 1))

    year_start = date(date.today().year, 1, 1).isoformat()
    ytd = [p for p in prices_desc if (p.get("date") or "") >= year_start]
    if len(ytd) >= 2 and ytd[0]["close_price"] and ytd[-1]["close_price"]:
        returns["ytd"] = (ytd[0]["close_price"] - ytd[-1]["close_price"]) / ytd[-1]["close_price"] * 100

    changes = [p["change_pct"] for p in prices_desc if p.get("change_pct") is not None]
    volatility = None
    if len(changes) >= 10:
        mean = sum(changes) / len(changes)
        variance = sum((x - mean) ** 2 for x in changes) / len(changes)
        volatility = math.sqrt(variance) * math.sqrt(TRADING_DAYS_PER_YEAR)

    return returns, volatility


# --- 전략 ---------------------------------------------------------------------

def _strategy_from_return(return_pct: float | None) -> str:
    if return_pct is None:
        return "관망"
    if return_pct > 10:
        return "비중확대"
    if return_pct > 5:
        return "보유"
    if return_pct > -5:
        return "관망"
    return "비중축소"


def _strategy_comment(short_ret, medium_ret, volatility, trading_flow_desc) -> str:
    comments = []
    if short_ret is not None:
        if short_ret > 5:
            comments.append("단기 급등 구간")
        elif short_ret < -5:
            comments.append("단기 하락 압력")
    if volatility is not None:
        if volatility > 30:
            comments.append("변동성 확대 예상")
        elif volatility < 15:
            comments.append("변동성 안정적")
    if trading_flow_desc:
        recent = trading_flow_desc[0]
        foreign_net = recent.get("foreign_net") or 0
        inst_net = recent.get("institutional_net") or 0
        if foreign_net > 0 and inst_net > 0:
            comments.append("기관·외국인 동시 매수")
        elif foreign_net < 0 and inst_net < 0:
            comments.append("기관·외국인 동시 매도")
    if not comments:
        return "현재 시장 상황을 지속적으로 모니터링 필요"
    return ", ".join(comments)


def _analyze_strategy(returns, volatility, trading_flow_desc) -> dict:
    short_term = _strategy_from_return(returns.get("1w"))
    medium_term = _strategy_from_return(returns.get("1m"))
    long_term = _strategy_from_return(returns.get("ytd"))
    recommendation = medium_term or short_term
    return {
        "short_term": short_term,
        "medium_term": medium_term,
        "long_term": long_term,
        "recommendation": recommendation,
        "comment": _strategy_comment(returns.get("1w"), returns.get("1m"), volatility, trading_flow_desc),
    }


# --- 핵심 포인트 / 리스크 -----------------------------------------------------

def _foreign_net_threshold(prices_desc: list[dict], days: int) -> float:
    volumes = [p["volume"] for p in prices_desc[:FOREIGN_NET_AVG_VOLUME_WINDOW] if p.get("volume")]
    if not volumes:
        return FOREIGN_NET_SUSTAINED_FALLBACK_THRESHOLD
    avg_volume = sum(volumes) / len(volumes)
    return FOREIGN_NET_SUSTAINED_VOLUME_RATIO * avg_volume * max(days, 1)


def _extract_key_points(returns, volatility, prices_desc, trading_flow_desc, news) -> list[str]:
    points: list[str] = []
    r1m = returns.get("1m")
    if r1m is not None:
        if r1m > 10:
            points.append(f"1개월 수익률 {r1m:.1f}%로 강세 지속")
        elif r1m < -10:
            points.append(f"1개월 수익률 {r1m:.1f}%로 약세 지속")
    if volatility is not None:
        if volatility > 30:
            points.append("변동성 확대 구간, 리스크 관리 필요")
        elif volatility < 15:
            points.append("변동성 안정적, 안전자산 선호 시 유리")
    if trading_flow_desc:
        recent = trading_flow_desc[:FOREIGN_NET_SUSTAINED_DAYS]
        foreign_sum = sum((f.get("foreign_net") or 0) for f in recent)
        threshold = _foreign_net_threshold(prices_desc, len(recent))
        if foreign_sum > threshold:
            points.append("외국인 대규모 순매수 지속")
        elif foreign_sum < -threshold:
            points.append("외국인 대규모 순매도 지속")
    if news and len(news) >= 5:
        points.append(f"최근 7일간 관련 뉴스 {len(news)}건으로 관심도 높음")
    if not points:
        points.append("충분한 데이터 확보 후 분석 진행")
    return points[:3]


def _analyze_risks(returns, volatility, news) -> list[str]:
    risks: list[str] = []
    if volatility and volatility > 30:
        risks.append("높은 변동성으로 인한 가격 급등락 리스크")
    r1m = returns.get("1m")
    if r1m is not None and r1m < -10:
        risks.append("최근 하락세 지속으로 추가 하락 가능성")
    titles = [n.get("title", "") for n in news]
    for keyword in RISK_KEYWORDS:
        if any(keyword in t for t in titles):
            if keyword == "규제":
                risks.append("규제 리스크: 정부 규제 강화 가능성")
            elif keyword == "관세":
                risks.append("관세 리스크: 무역 분쟁 확대 우려")
            elif keyword == "금리":
                risks.append("금리 리스크: 금리 변동성 확대")
            elif keyword == "환율":
                risks.append("환율 리스크: 원/달러 환율 변동성 확대")
            break
    if not risks:
        risks.append("시장 전반의 변동성 리스크 존재")
    return risks[:3]


# --- 진입점 -------------------------------------------------------------------

def build_insights(ticker: str, period: str = "1m") -> dict | None:
    """종목 인사이트 {strategy, key_points, risks}. 종목이 없으면 None."""
    if not repository.get_stock(ticker):
        return None

    # 지표는 최근 1년 시세 기준(최신순), 매매동향/뉴스는 최근분.
    prices_asc = repository.get_prices(ticker, days=365)
    prices_desc = list(reversed(prices_asc))
    flow_desc = list(reversed(repository.get_trading_flow(ticker, days=30)))

    week_ago = (date.today() - timedelta(days=7)).isoformat()
    news = [n for n in repository.get_news(ticker, limit=50)
            if (n.get("pub_date") or "")[:10] >= week_ago]

    returns, volatility = _compute_metrics(prices_desc)
    return {
        "strategy": _analyze_strategy(returns, volatility, flow_desc),
        "key_points": _extract_key_points(returns, volatility, prices_desc, flow_desc, news),
        "risks": _analyze_risks(returns, volatility, news),
    }
