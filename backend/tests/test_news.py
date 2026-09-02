"""작업 3(뉴스) 통합 테스트: 검색 API 파싱 → 수집(그레이스풀) → 조회 → 엔드포인트."""
import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app import config
from app.database import get_connection
from app.main import app
from app.services import collectors, naver_client, repository
from tests.conftest import seed_stock

client = TestClient(app)


@pytest.fixture
def enable_search(monkeypatch):
    """검색 API 자격증명이 설정된 상태를 모사한다."""
    monkeypatch.setattr(config, "NAVER_CLIENT_ID", "test-id")
    monkeypatch.setattr(config, "NAVER_CLIENT_SECRET", "test-secret")


def _search_response():
    return {
        "items": [
            {
                "title": "삼성전자 <b>신고가</b> 경신",
                "originallink": "https://news.example.com/a",
                "link": "https://n.news.naver.com/a",
                "description": "삼성전자가 &quot;사상 최고&quot;를 기록했다",
                "pubDate": "Mon, 21 Jul 2026 09:00:00 +0900",
            },
            {
                "title": "반도체 업황 회복",
                "originallink": "",
                "link": "https://n.news.naver.com/b",
                "description": "설명",
                "pubDate": "Tue, 22 Jul 2026 10:30:00 +0900",
            },
        ]
    }


# --- naver_client.fetch_news --------------------------------------------------

def test_fetch_news_disabled_without_keys(monkeypatch):
    monkeypatch.setattr(config, "NAVER_CLIENT_ID", None)
    monkeypatch.setattr(config, "NAVER_CLIENT_SECRET", None)
    assert naver_client.fetch_news("삼성전자") == []


@respx.mock
def test_fetch_news_parses_and_cleans(enable_search):
    respx.get(naver_client.SEARCH_NEWS_URL).mock(
        return_value=httpx.Response(200, json=_search_response())
    )
    rows = naver_client.fetch_news("삼성전자", display=10)
    assert len(rows) == 2
    # <b> 태그 제거, HTML 엔티티 복원
    assert rows[0]["title"] == "삼성전자 신고가 경신"
    assert rows[0]["description"] == '삼성전자가 "사상 최고"를 기록했다'
    # originallink 우선, 없으면 link 사용
    assert rows[0]["link"] == "https://news.example.com/a"
    assert rows[1]["link"] == "https://n.news.naver.com/b"
    # pubDate → ISO8601
    assert rows[0]["pub_date"].startswith("2026-07-21T09:00:00")


# --- collectors.collect_news --------------------------------------------------

def test_collect_news_returns_zero_when_disabled(monkeypatch):
    monkeypatch.setattr(config, "NAVER_CLIENT_ID", None)
    seed_stock("005930", "삼성전자", "STOCK")
    assert collectors.collect_news("005930") == 0


@respx.mock
def test_collect_news_upserts_idempotently(enable_search):
    seed_stock("005930", "삼성전자", "STOCK")
    respx.get(naver_client.SEARCH_NEWS_URL).mock(
        return_value=httpx.Response(200, json=_search_response())
    )
    assert collectors.collect_news("005930") == 2
    # 재수집해도 link 기준 upsert라 중복 없이 2건 유지
    assert collectors.collect_news("005930") == 2
    with get_connection() as conn:
        n = conn.execute(
            "SELECT COUNT(*) FROM news WHERE ticker='005930'"
        ).fetchone()[0]
    assert n == 2


# --- repository + 엔드포인트 --------------------------------------------------

@respx.mock
def test_get_news_orders_by_pub_date_desc(enable_search):
    seed_stock("005930", "삼성전자", "STOCK")
    respx.get(naver_client.SEARCH_NEWS_URL).mock(
        return_value=httpx.Response(200, json=_search_response())
    )
    collectors.collect_news("005930")
    rows = repository.get_news("005930", limit=10)
    # 최신(07-22)이 먼저
    assert rows[0]["link"] == "https://n.news.naver.com/b"


def test_get_news_dedupes_identical_titles():
    """재크롤링으로 같은 기사가 링크만 미세하게 다르게 저장돼도 제목이
    같으면 최신 1건만 남아야 한다."""
    seed_stock("005930", "삼성전자", "STOCK")
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO news (ticker, title, link, pub_date) VALUES (?, ?, ?, ?)",
            ("005930", "삼성전자 신고가", "https://a.example.com/old", "2026-07-22T10:00:00+09:00"),
        )
        conn.execute(
            "INSERT INTO news (ticker, title, link, pub_date) VALUES (?, ?, ?, ?)",
            ("005930", "삼성전자 신고가", "https://a.example.com/recrawled", "2026-07-22T10:00:00+09:00"),
        )
        conn.execute(
            "INSERT INTO news (ticker, title, link, pub_date) VALUES (?, ?, ?, ?)",
            ("005930", "반도체 업황 회복", "https://b.example.com/1", "2026-07-21T09:00:00+09:00"),
        )
    rows = repository.get_news("005930", limit=10)
    assert len(rows) == 2
    titles = [r["title"] for r in rows]
    assert titles.count("삼성전자 신고가") == 1


def test_news_endpoint_empty_list_when_none_collected():
    seed_stock("005930", "삼성전자", "STOCK")
    r = client.get("/api/news/005930")
    assert r.status_code == 200
    assert r.json()["news"] == []


def test_news_endpoint_honors_limit():
    seed_stock("005930", "삼성전자", "STOCK")
    with get_connection() as conn:
        for i in range(8):
            conn.execute(
                "INSERT INTO news (ticker, title, link, pub_date) VALUES (?,?,?,?)",
                ("005930", f"뉴스 {i}", f"https://n/{i}", f"2026-07-{i + 1:02d}T09:00:00"),
            )
    # limit=3이면 최신 3건만.
    body = client.get("/api/news/005930?limit=3").json()
    assert len(body["news"]) == 3


# --- 이식 프론트 계약: /api/news/{ticker} ---

def test_news_router_list_shape():
    seed_stock("005930", "삼성전자", "STOCK")
    from app.database import get_connection
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO news (ticker, title, link, description, pub_date) VALUES (?,?,?,?,?)",
            ("005930", "삼성 신고가", "https://www.news.example.com/a", "설명", "2026-07-21T09:00:00+09:00"),
        )
    body = client.get("/api/news/005930").json()
    assert "news" in body and "analysis" in body
    item = body["news"][0]
    assert item["title"] == "삼성 신고가"
    assert item["url"].endswith("/a")
    assert item["source"] == "news.example.com"  # www. 제거
    assert item["date"] == "2026-07-21"
    for f in ("published_at", "sentiment", "tags", "relevance_score"):
        assert f in item
