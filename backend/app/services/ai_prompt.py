"""AI 투자분석 프롬프트 생성 — DB 데이터(RAG context)를 결합한 프롬프트를 만든다.

실제 LLM(Perplexity/Gemini/ChatGPT/Claude) 호출은 프론트가 수행하므로, 이 서비스는
프롬프트 문자열 생성까지만 담당한다. 원본(ETFWeeklyReport PerplexityService)과 의미가
동일하되, 이 프로젝트의 SQLite 스키마(prices/trading_flow/news/*_fundamentals/
etf_holdings)에 맞춰 RAG context를 구성한다.
"""
from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

from app.services import repository

logger = logging.getLogger(__name__)

# 프롬프트 템플릿: backend/prompt/perplexity.md
# __file__ = backend/app/services/ai_prompt.py → parents[2] = backend
PROMPT_TEMPLATE_PATH = Path(__file__).resolve().parents[2] / "prompt" / "perplexity.md"

# RAG context 조회 기본 거래일 수(원본과 동일하게 최근 7거래일).
_CONTEXT_DAYS = 7

_template_cache: str | None = None


# --- 포맷 헬퍼 (None 안전) ----------------------------------------------------

def _f0(v) -> str:
    """정수형 표기(천단위 콤마). None이면 '-'."""
    return f"{v:,.0f}" if v is not None else "-"


def _f2(v, suffix: str = "") -> str:
    """소수 2자리 표기. None이면 '-'."""
    return f"{v:,.2f}{suffix}" if v is not None else "-"


def _pct(v) -> str:
    """부호 포함 백분율(2자리). None이면 '-'."""
    return f"{v:+.2f}%" if v is not None else "-"


# --- DB context 섹션 ----------------------------------------------------------

def _section_prices(lines: list[str], prices_desc: list[dict]) -> None:
    """1. 최근 N거래일 가격 데이터 + 주간 수익률."""
    if not prices_desc:
        return
    lines.append(f"### 1. 최근 {len(prices_desc)}거래일 가격 데이터")
    lines.append("")
    lines.append("| 날짜 | 시가 | 고가 | 저가 | 종가 | 거래량 | 등락률(%) |")
    lines.append("|------|------|------|------|------|--------|----------|")
    for p in prices_desc:
        lines.append(
            f"| {p.get('date')} | {_f0(p.get('open_price'))} | {_f0(p.get('high_price'))} | "
            f"{_f0(p.get('low_price'))} | {_f0(p.get('close_price'))} | "
            f"{_f0(p.get('volume'))} | {_pct(p.get('change_pct'))} |"
        )
    # 주간 수익률: 표에 담긴 최고(오래된)·최신 종가 비교.
    first_close = prices_desc[-1].get("close_price")
    last_close = prices_desc[0].get("close_price")
    if first_close and last_close:
        weekly = (last_close - first_close) / first_close * 100
        lines.append("")
        lines.append(f"**주간 수익률**: {weekly:+.2f}%")
    lines.append("")


def _section_flow(lines: list[str], flow_desc: list[dict], close_by_date: dict) -> None:
    """2. 매매동향(투자자별 순매수) — 주수 + 금액(억원)."""
    if not flow_desc:
        return
    lines.append(f"### 2. 최근 {len(flow_desc)}거래일 매매동향 (순매수)")
    lines.append("")
    lines.append("| 날짜 | 개인 (주) | 기관 (주) | 외국인 (주) | 개인 (억원) | 기관 (억원) | 외국인 (억원) |")
    lines.append("|------|----------|----------|-----------|-----------|-----------|-------------|")
    for f in flow_desc:
        ind = f.get("individual_net") or 0
        inst = f.get("institutional_net") or 0
        fore = f.get("foreign_net") or 0
        close = close_by_date.get(f.get("date")) or 0
        if close > 0:
            ind_krw = ind * close / 100_000_000
            inst_krw = inst * close / 100_000_000
            fore_krw = fore * close / 100_000_000
            krw = f"{ind_krw:+.1f} | {inst_krw:+.1f} | {fore_krw:+.1f}"
        else:
            krw = "- | - | -"
        lines.append(f"| {f.get('date')} | {ind:+,} | {inst:+,} | {fore:+,} | {krw} |")
    lines.append("")


def _section_news(lines: list[str], news: list[dict]) -> None:
    """3. 최근 뉴스."""
    if not news:
        return
    lines.append(f"### 3. 최근 뉴스 ({len(news)}개)")
    lines.append("")
    for i, n in enumerate(news, 1):
        news_date = (n.get("pub_date") or "")[:10] or "-"
        lines.append(f"{i}. [{news_date}] {n.get('title')}")
        if n.get("link"):
            lines.append(f"   - URL: {n.get('link')}")
    lines.append("")


def _section_52week(lines: list[str], prices_year: list[dict], current_price) -> None:
    """4. 52주 최고/최저가 대비 현재가 위치."""
    highs = [p["high_price"] for p in prices_year if p.get("high_price") is not None]
    lows = [p["low_price"] for p in prices_year if p.get("low_price") is not None]
    if not highs or not lows or current_price is None:
        return
    max_high, min_low = max(highs), min(lows)
    lines.append("### 4. 52주 최고/최저가 대비 현재가 위치")
    lines.append("")
    lines.append(f"- **52주 최고가**: {max_high:,.0f}원")
    lines.append(f"- **52주 최저가**: {min_low:,.0f}원")
    lines.append(f"- **현재가**: {current_price:,.0f}원")
    if max_high > min_low:
        position = (current_price - min_low) / (max_high - min_low) * 100
        lines.append(f"- **52주 범위 내 위치**: {position:.1f}%")
    lines.append("")


def _ema(data: list[float], period: int) -> float:
    """마지막 EMA 값(첫 EMA는 SMA로 시드)."""
    multiplier = 2 / (period + 1)
    ema = sum(data[:period]) / period
    for price in data[period:]:
        ema = (price - ema) * multiplier + ema
    return ema


def _section_technical(lines: list[str], closes_asc: list[float]) -> None:
    """5. 기술적 분석 지표(MA·RSI·MACD). closes_asc는 오래된→최신."""
    if len(closes_asc) < 20:
        return
    lines.append("### 5. 기술적 분석 지표")
    lines.append("")
    current = closes_asc[-1]

    ma5 = sum(closes_asc[-5:]) / 5 if len(closes_asc) >= 5 else None
    ma20 = sum(closes_asc[-20:]) / 20 if len(closes_asc) >= 20 else None
    ma60 = sum(closes_asc[-60:]) / 60 if len(closes_asc) >= 60 else None

    lines.append("**이동평균선 (MA)**:")
    for label, ma in (("MA5", ma5), ("MA20", ma20), ("MA60", ma60)):
        if ma:
            diff = (current - ma) / ma * 100
            lines.append(f"- {label}: {ma:,.0f}원 (현재가 대비 {diff:+.2f}%)")
    if ma5 and ma20 and ma60:
        if ma5 > ma20 > ma60:
            lines.append("- **추세**: 정배열 (상승 추세)")
        elif ma5 < ma20 < ma60:
            lines.append("- **추세**: 역배열 (하락 추세)")
        else:
            lines.append("- **추세**: 혼조 (횡보)")
    lines.append("")

    # RSI(14)
    if len(closes_asc) >= 15:
        gains, losses = [], []
        for i in range(1, len(closes_asc)):
            change = closes_asc[i] - closes_asc[i - 1]
            gains.append(change if change > 0 else 0)
            losses.append(-change if change < 0 else 0)
        avg_gain = sum(gains[-14:]) / 14
        avg_loss = sum(losses[-14:]) / 14
        rsi = 100 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
        lines.append("**RSI(14)**:")
        lines.append(f"- RSI: {rsi:.1f}")
        if rsi >= 70:
            lines.append("- **신호**: 과매수 구간 (≥70)")
        elif rsi <= 30:
            lines.append("- **신호**: 과매도 구간 (≤30)")
        else:
            lines.append("- **신호**: 중립")
        lines.append("")

    # MACD (12/26 EMA)
    if len(closes_asc) >= 26:
        ema12 = _ema(closes_asc, 12)
        ema26 = _ema(closes_asc, 26)
        macd_line = ema12 - ema26
        lines.append("**MACD**:")
        lines.append(f"- MACD Line: {macd_line:,.2f}")
        lines.append(f"- EMA12: {ema12:,.0f}원")
        lines.append(f"- EMA26: {ema26:,.0f}원")
        lines.append("- **신호**: " + ("상승 모멘텀 (MACD > 0)" if macd_line > 0 else "하락 모멘텀 (MACD < 0)"))
        lines.append("")


def _section_etf_fundamentals(lines: list[str], fund: dict | None, holdings: list[dict]) -> None:
    """6. ETF 펀더멘털 + 구성종목 상위."""
    lines.append("### 6. ETF 펀더멘털 데이터")
    lines.append("")
    if fund:
        lines.append(f"- **운용사**: {fund.get('issuer_name') or '-'}")
        lines.append(f"- **순자산총액(총 NAV)**: {fund.get('total_nav') or '-'}")
        lines.append(f"- **NAV**: {_f0(fund.get('nav'))}원")
        lines.append(f"- **괴리율**: {_f2(fund.get('deviation_rate'), '%')}")
        lines.append(f"- **총보수(연)**: {_f2(fund.get('total_fee'), '%')}")
        lines.append(f"- **배당수익률**: {_f2(fund.get('dividend_yield'), '%')}")
        lines.append(
            f"- **수익률**: 1개월 {_pct(fund.get('return_1m'))} / "
            f"3개월 {_pct(fund.get('return_3m'))} / 1년 {_pct(fund.get('return_1y'))}"
        )
        lines.append("")
    if holdings:
        lines.append("**구성종목 상위 (Top 10)**:")
        lines.append("")
        lines.append("| 순위 | 종목코드 | 종목명 | 편입비중(%) |")
        lines.append("|------|---------|--------|-----------|")
        total_weight = 0.0
        for h in holdings:
            total_weight += h.get("weight") or 0
            lines.append(
                f"| {h.get('seq')} | {h.get('item_code') or '-'} | "
                f"{h.get('item_name') or '-'} | {_f2(h.get('weight'))} |"
            )
        lines.append("")
        lines.append(f"- **상위 종목 비중 합계**: {total_weight:.2f}%")
        lines.append("")


def _section_stock_fundamentals(lines: list[str], sf: dict | None) -> None:
    """7. 주식 펀더멘털(밸류에이션)."""
    if not sf:
        return
    lines.append("### 7. 주식 펀더멘털 데이터")
    lines.append("")
    lines.append("**밸류에이션 지표**:")
    lines.append("")
    lines.append("| 지표 | 값 |")
    lines.append("|------|----|")
    lines.append(f"| PER | {_f2(sf.get('per'), '배')} |")
    lines.append(f"| PBR | {_f2(sf.get('pbr'), '배')} |")
    lines.append(f"| EPS | {_f0(sf.get('eps'))}원 |")
    lines.append(f"| BPS | {_f0(sf.get('bps'))}원 |")
    lines.append(f"| 추정 PER | {_f2(sf.get('est_per'), '배')} |")
    lines.append(f"| 추정 EPS | {_f0(sf.get('est_eps'))}원 |")
    lines.append(f"| 시가배당률 | {_f2(sf.get('dividend_yield'), '%')} |")
    lines.append(f"| 주당 배당금 | {_f0(sf.get('dividend'))}원 |")
    lines.append(f"| 외국인 보유율 | {_f2(sf.get('foreign_rate'), '%')} |")
    lines.append(f"| 52주 최고 | {_f0(sf.get('high_52w'))}원 |")
    lines.append(f"| 52주 최저 | {_f0(sf.get('low_52w'))}원 |")
    if sf.get("market_value"):
        lines.append(f"| 시가총액 | {sf.get('market_value')} |")
    lines.append("")


def _fetch_db_context(ticker: str, name: str, days: int = _CONTEXT_DAYS) -> str:
    """DB에서 실제 데이터를 조회해 구조화된 RAG context 텍스트를 만든다."""
    lines: list[str] = [
        "=" * 80,
        "⚠️  [중요] 아래는 실제 DB에서 조회한 데이터입니다.",
        "보고서 작성 시 **반드시 이 데이터를 우선적으로 사용**하고, 웹 검색은 보조적으로만 활용하세요.",
        "임의 추정치나 오래된 웹 데이터는 사용하지 마세요.",
        "=" * 80,
        "",
        f"## 실제 DB 데이터: {name} ({ticker})",
        "",
    ]
    try:
        stock = repository.get_stock(ticker)
        is_etf = bool(stock and stock.get("type") == "ETF")

        # 최근 1년 시세(오래된→최신). 표·기술지표·52주 범위 모두 여기서 파생.
        prices_year = repository.get_prices(ticker, days=365)
        prices_desc = list(reversed(prices_year))
        recent_desc = prices_desc[:days]
        closes_asc = [p["close_price"] for p in prices_year if p.get("close_price") is not None]
        current_price = prices_desc[0].get("close_price") if prices_desc else None
        close_by_date = {p["date"]: p.get("close_price") for p in prices_year}

        _section_prices(lines, recent_desc)

        flow_desc = list(reversed(repository.get_trading_flow(ticker, days=days)))
        _section_flow(lines, flow_desc, close_by_date)

        _section_news(lines, repository.get_news(ticker, limit=10))
        _section_52week(lines, prices_year, current_price)
        _section_technical(lines, closes_asc)

        fundamentals = repository.get_fundamentals(ticker) or {}
        if is_etf:
            _section_etf_fundamentals(
                lines, fundamentals.get("etf"), fundamentals.get("holdings") or []
            )
        else:
            _section_stock_fundamentals(lines, fundamentals.get("stock"))
    except Exception as exc:  # noqa: BLE001 - context 실패해도 프롬프트는 생성
        logger.error("DB context 조회 실패(%s): %s", ticker, exc, exc_info=True)
        lines.append(f"⚠️ DB 데이터 조회 중 오류 발생: {exc}")
        lines.append("")

    return "\n".join(lines)


# --- 템플릿 / 프롬프트 조립 ----------------------------------------------------

def _load_template() -> str:
    global _template_cache
    if _template_cache is None:
        if not PROMPT_TEMPLATE_PATH.exists():
            raise FileNotFoundError(f"프롬프트 템플릿을 찾을 수 없습니다: {PROMPT_TEMPLATE_PATH}")
        _template_cache = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
    return _template_cache


def _build_single_prompt(name: str, ticker: str, db_context: str | None) -> str:
    today = date.today().isoformat()
    prompt = (
        _load_template()
        .replace("{종목명}", name)
        .replace("{티커코드}", ticker)
        .replace("YYYY-MM-DD", today)
    )
    if db_context:
        prompt = f"{db_context}\n\n---\n\n{prompt}"
    return prompt


def _build_multi_prompt(stocks: list[dict]) -> str:
    today = date.today().isoformat()
    names = ", ".join(f"{s['name']}({s['ticker']})" for s in stocks)
    stock_list = "\n".join(f"- **{s['name']}** ({s['ticker']})" for s in stocks)
    return f"""당신은 한국 주식·ETF를 전문적으로 분석하는 **리서치 애널리스트**입니다.
아래 종목들에 대한 **통합 비교 투자분석 보고서**를 작성하세요.

### 분석 대상 종목
{stock_list}

### 공통 작성 규칙
- 모든 수치는 **최신 실제 데이터**만 사용하고, 임의 추정치는 사용하지 마세요.
- 리포트 작성 기준일은 **{today}**로 설정하고, "최근 7거래일"은 이 기준일을 포함해 직전 7개 거래일로 정의하세요.
- 데이터 출처(예: KRX, 네이버금융, 인베스팅닷컴, 운용사 웹사이트 등)를 문장 중간에서 간단히 언급하세요.
- 한국 투자자를 대상으로, 한국어(존댓말)로 작성하세요.
- 분량은 최소 5,000단어 수준으로 **상세하게** 작성하세요.

---

## 1. 종목 개요 비교

각 종목({names})의 기본 정보(테마, 운용사, 총보수 등)와 최근 주가·수익률을 비교표로 정리하세요.

---

## 2. 주간 시장 데이터 비교 (최근 7거래일)

각 종목의 최근 7거래일 종가, 등락률, 거래량을 종목별로 나란히 비교하는 표를 작성하고 핵심 요약을 제공하세요.

---

## 3. 기술적 분석 비교

각 종목의 이동평균선(5/20/60일), RSI(14), MACD 상태를 비교표로 정리하고, 종목 간 기술적 강약을 분석하세요.

---

## 4. 시장 환경 및 섹터 비교

각 종목이 속한 섹터의 글로벌·국내 핵심 이슈를 정리하고, 섹터 간 상대적 모멘텀을 비교하세요.

---

## 5. 수급 분석 비교

각 종목의 최근 7거래일 개인/기관/외국인 순매수 동향을 비교표로 정리하고, 수급 관점의 유리한 종목을 평가하세요.

---

## 6. 펀더멘털 비교

각 종목의 NAV·괴리율·총보수·수익률(ETF) 또는 PER·PBR·배당(주식) 등을 비교표로 정리하세요.

---

## 7. 상관관계 및 분산 효과

종목 간 가격 상관관계를 정성적으로 평가하고, 포트폴리오 분산 효과가 있는지 분석하세요.

---

## 8. 종합 비교 매력도 순위

모든 분석을 종합하여 종목별 투자 매력도를 순위로 정리하세요. 각 종목의 강점·약점을 1~2줄로 요약하세요.

| 순위 | 종목 | 투자 매력도 | 핵심 강점 | 주요 리스크 |
|------|------|------------|----------|------------|

---

## 9. 투자자 유형별 추천

- **공격적 투자자**: 위 종목 중 비중 확대 추천 종목과 근거
- **보수적 투자자**: 안정적 선택지와 분할 매수 전략
- **포트폴리오 조합 제안**: 위 종목들의 최적 비중 배분 가이드

---

## 10. 종합 의견 및 액션 플랜

- 각 종목에 대한 단기(1주)/중기(1~3개월) 전망
- 종목 간 상대적 우선순위와 교체 매매 전략
- 구체적인 분할 매수/매도 기준

---

위 템플릿 전체를 반영하여, 실제 투자 의사결정에 바로 활용 가능한 **고품질 통합 비교 리포트**를 작성하세요."""


# --- 진입점 -------------------------------------------------------------------

def get_prompt(ticker: str, name: str, use_db_data: bool = True) -> str:
    """단일 종목 분석 프롬프트를 생성해 반환(LLM 호출 없음)."""
    db_context = _fetch_db_context(ticker, name) if use_db_data else None
    return _build_single_prompt(name, ticker, db_context)


def get_multi_prompt(stocks: list[dict], use_db_data: bool = True) -> str:
    """복수 종목 통합 비교 분석 프롬프트를 생성해 반환(LLM 호출 없음)."""
    base = _build_multi_prompt(stocks)
    if not use_db_data:
        return base
    contexts = [_fetch_db_context(s["ticker"], s["name"]) for s in stocks]
    return f"{chr(10).join(contexts)}\n\n---\n\n{base}"
