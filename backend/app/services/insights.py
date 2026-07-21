"""종목 핵심포인트(인사이트) 생성 — 수집된 시세·수급·펀더멘털의 규칙 기반 요약.

매매동향 판정은 단일일·고정 임계값이 아니라 **최근 N거래일 순매수 합계를
같은 기간 일평균 거래량 대비 비율**로 스케일링해 강도(대규모)와 지속성을 본다.
DB 테이블 없이 조회 시점에 실시간 계산한다(별도 수집·스키마 불필요).
"""
from __future__ import annotations

from datetime import datetime

from app.services import repository

# 수급 판정 파라미터 (거래량 대비 누적 순매수 비율 기준).
FLOW_WINDOW = 5           # 최근 거래일 수
MEANINGFUL_RATIO = 0.05   # 일평균 거래량의 5% 이상이면 유의미
LARGE_RATIO = 0.15        # 15% 이상이면 대규모
PERSIST_DAYS = 4          # 같은 방향이 4일 이상이면 '지속'

DISCLAIMER = "수집된 시세·수급 데이터에 기반한 자동 요약이며, 투자 판단의 근거가 아닙니다."


def _flow_signal(key: str, label: str, nets: list, avg_volume: float | None) -> dict | None:
    """투자자별 순매수 수급 신호. nets는 최근순 무관 리스트(합계·부호만 사용)."""
    vals = [v for v in nets if v is not None]
    if not vals or not avg_volume:
        return None
    total = sum(vals)
    ratio = total / avg_volume
    magnitude = abs(ratio)
    # 합계 방향과 같은 부호인 거래일 수(지속성).
    same_dir = sum(1 for v in vals if v != 0 and (v > 0) == (total > 0))
    pct = ratio * 100

    if magnitude < MEANINGFUL_RATIO:
        text = (
            f"최근 {len(vals)}거래일 {label} 수급은 뚜렷한 방향성이 없습니다 "
            f"(누적 {total:+,}주, 일평균 거래량의 {pct:+.1f}%)."
        )
        return {"key": key, "label": label, "level": "neutral", "text": text}

    direction = "순매수" if total > 0 else "순매도"
    tier = "대규모 " if magnitude >= LARGE_RATIO else ""
    persist = " 지속" if same_dir >= PERSIST_DAYS else ""
    level = "positive" if total > 0 else "negative"
    text = (
        f"최근 {len(vals)}거래일 {label} {tier}{direction}{persist} "
        f"(누적 {total:+,}주, 일평균 거래량의 {pct:+.1f}%)."
    )
    return {"key": key, "label": label, "level": level, "text": text}


def _trend_signal(prices: list) -> dict | None:
    """가격 추세 신호: 5거래일·전체 창 등락률."""
    closes = [p["close_price"] for p in prices if p.get("close_price")]
    if len(closes) < 2:
        return None
    last = closes[-1]

    def pct(base):
        return (last / base - 1) * 100 if base else None

    ch_full = pct(closes[0])
    ch5 = pct(closes[-6]) if len(closes) >= 6 else None
    days_full = len(closes) - 1

    parts = []
    if ch5 is not None:
        parts.append(f"5거래일 {ch5:+.1f}%")
    parts.append(f"{days_full}거래일 {ch_full:+.1f}%")
    ref = ch5 if ch5 is not None else ch_full
    level = "positive" if ref > 1 else "negative" if ref < -1 else "neutral"
    trend_word = "상승 추세" if level == "positive" else "하락 추세" if level == "negative" else "횡보"
    text = f"가격 {trend_word} ({', '.join(parts)})."
    return {"key": "price_trend", "label": "가격 추세", "level": level, "text": text}


def _range_52w_signal(stock_fund: dict | None, last_close: float | None) -> dict | None:
    """52주 범위 내 위치(주식 전용)."""
    if not stock_fund or last_close is None:
        return None
    high, low = stock_fund.get("high_52w"), stock_fund.get("low_52w")
    if not high or not low or high <= low:
        return None
    pos = (last_close - low) / (high - low) * 100
    if pos >= 85:
        level, where = "positive", "52주 최고가 부근"
    elif pos <= 15:
        level, where = "negative", "52주 최저가 부근"
    else:
        level, where = "neutral", "52주 범위 중단"
    text = f"현재가는 {where}입니다 (52주 위치 {pos:.0f}%)."
    return {"key": "range_52w", "label": "52주 위치", "level": level, "text": text}


def _valuation_signal(fund: dict | None) -> dict | None:
    """밸류에이션/ETF 지표 코멘트(값 제시 위주, 강한 판정은 지양)."""
    if not fund:
        return None
    if fund.get("type") == "ETF":
        etf = fund.get("etf")
        if not etf:
            return None
        bits = []
        if etf.get("deviation_rate") is not None:
            bits.append(f"괴리율 {etf['deviation_rate']:+.2f}%")
        if etf.get("return_1y") is not None:
            bits.append(f"1년 수익률 {etf['return_1y']:+.1f}%")
        if etf.get("total_fee") is not None:
            bits.append(f"총보수 {etf['total_fee']:.2f}%")
        if not bits:
            return None
        return {"key": "valuation", "label": "ETF 지표", "level": "neutral", "text": " · ".join(bits) + "."}

    stock = fund.get("stock")
    if not stock:
        return None
    bits = []
    if stock.get("per") is not None:
        bits.append(f"PER {stock['per']:.2f}배")
    if stock.get("pbr") is not None:
        bits.append(f"PBR {stock['pbr']:.2f}배")
    if stock.get("dividend_yield"):
        bits.append(f"배당수익률 {stock['dividend_yield']:.2f}%")
    if not bits:
        return None
    return {"key": "valuation", "label": "밸류에이션", "level": "neutral", "text": " · ".join(bits) + "."}


def _summary(foreign: dict | None, trend: dict | None) -> str:
    """외국인 수급·가격 추세를 조합한 한 줄 국면 요약."""
    f = foreign["level"] if foreign else "neutral"
    t = trend["level"] if trend else "neutral"
    if f == "positive" and t == "positive":
        return "외국인 순매수와 상승 추세가 동반된 강세 국면입니다."
    if f == "positive" and t == "negative":
        return "외국인은 순매수하나 단기 가격은 조정받는 국면입니다."
    if f == "negative" and t == "negative":
        return "외국인 순매도와 하락 추세가 겹친 약세 국면입니다."
    if f == "negative" and t == "positive":
        return "가격은 상승하나 외국인 순매도가 나타나는 국면입니다."
    if f == "positive":
        return "외국인 순매수가 유입되는 국면입니다."
    if f == "negative":
        return "외국인 순매도가 나타나는 국면입니다."
    return "뚜렷한 수급·추세 신호가 제한적인 관망 국면입니다."


def build_insights(ticker: str) -> dict | None:
    """종목 인사이트를 계산해 반환. 종목이 없으면 None."""
    stock = repository.get_stock(ticker)
    if not stock:
        return None

    prices = repository.get_prices(ticker, days=20)          # 오래된→최신 순
    flow = repository.get_trading_flow(ticker, days=FLOW_WINDOW)
    fund = repository.get_fundamentals(ticker)

    # 수급 창과 같은 길이의 최근 거래량으로 일평균 거래량 계산.
    window = min(len(flow), FLOW_WINDOW)
    vols = [p["volume"] for p in prices[-window:] if p.get("volume")] if window else []
    avg_volume = sum(vols) / len(vols) if vols else None

    foreign = _flow_signal(
        "foreign_flow", "외국인", [f.get("foreign_net") for f in flow], avg_volume
    )
    institutional = _flow_signal(
        "institutional_flow", "기관", [f.get("institutional_net") for f in flow], avg_volume
    )
    trend = _trend_signal(prices)
    last_close = prices[-1]["close_price"] if prices else None
    stock_fund = fund.get("stock") if fund and fund.get("type") == "STOCK" else None
    range_52w = _range_52w_signal(stock_fund, last_close)
    valuation = _valuation_signal(fund)

    signals = [s for s in (foreign, institutional, trend, range_52w, valuation) if s]

    return {
        "ticker": ticker,
        "type": stock.get("type", "STOCK"),
        "summary": _summary(foreign, trend) if signals else "분석에 필요한 데이터가 부족합니다.",
        "signals": signals,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "disclaimer": DISCLAIMER,
    }
