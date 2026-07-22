"""종목 뉴스 조회(이식 프론트 계약). 원본 /news/{ticker} → NewsListResponse 형태."""
from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Query

from app.services import repository

router = APIRouter(prefix="/api/news", tags=["news"])


def _source_from_url(url: str | None) -> str:
    if not url:
        return ""
    try:
        host = urlparse(url).netloc
        return host[4:] if host.startswith("www.") else host
    except ValueError:
        return ""


@router.get("/{ticker}")
def get_news(ticker: str, analyze: bool = Query(True)):
    """종목 뉴스 목록. {news: [...], analysis} 형태(원본과 동일).

    감성/태그 분석(analyze)은 현재 미지원이라 sentiment/tags는 비워 반환한다.
    """
    rows = repository.get_news(ticker, limit=50)
    news = [
        {
            "date": (r.get("pub_date") or "")[:10] or None,
            "published_at": r.get("pub_date"),
            "title": r.get("title"),
            "url": r.get("link"),
            "source": _source_from_url(r.get("link")),
            "sentiment": None,
            "tags": [],
            "relevance_score": None,
        }
        for r in rows
    ]
    return {"news": news, "analysis": None}
