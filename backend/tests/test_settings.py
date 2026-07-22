"""Phase 2(설정) 테스트: 종목 CRUD·정렬·검색·검증·API 키."""
import httpx
import respx
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import naver_client
from tests.conftest import seed_stock

client = TestClient(app)


def test_get_stocks_full_shape():
    seed_stock("005930", "삼성전자", "STOCK", theme="반도체")
    rows = client.get("/api/settings/stocks").json()
    assert rows[0]["ticker"] == "005930"
    assert "purchase_price" in rows[0] and "relevance_keywords" in rows[0]


def test_create_update_delete_stock():
    # 생성
    r = client.post("/api/settings/stocks", json={
        "ticker": "000660", "name": "SK하이닉스", "type": "STOCK",
        "theme": "반도체", "relevance_keywords": ["SK하이닉스", "반도체"],
    })
    assert r.status_code == 201
    assert r.json()["relevance_keywords"] == ["SK하이닉스", "반도체"]
    # 중복 생성은 400
    assert client.post("/api/settings/stocks", json={
        "ticker": "000660", "name": "중복", "type": "STOCK"}).status_code == 400
    # 부분 수정
    r = client.put("/api/settings/stocks/000660", json={"theme": "반도체 메모리"})
    assert r.json()["theme"] == "반도체 메모리"
    assert r.json()["name"] == "SK하이닉스"  # 유지
    # 삭제(+cascade 반환)
    r = client.delete("/api/settings/stocks/000660")
    assert r.status_code == 200
    assert r.json()["ticker"] == "000660" and "deleted" in r.json()
    assert client.delete("/api/settings/stocks/000660").status_code == 404


def test_reorder_sets_sort_order():
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    client.post("/api/settings/stocks/reorder", json=["000660", "005930"])
    rows = client.get("/api/settings/stocks").json()
    assert [r["ticker"] for r in rows[:2]] == ["000660", "005930"]  # 지정 순서 반영


def test_search_matches_name_and_ticker():
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("005935", "삼성전자우", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    res = client.get("/api/settings/stocks/search", params={"q": "삼성"}).json()
    tickers = {s["ticker"] for s in res}
    assert tickers == {"005930", "005935"}


def test_search_too_short_400():
    assert client.get("/api/settings/stocks/search", params={"q": "삼"}).status_code == 400


@respx.mock
def test_validate_ticker_via_naver():
    respx.get(f"{naver_client.MSTOCK_BASE}/005930/basic").mock(
        return_value=httpx.Response(200, json={
            "itemCode": "005930", "stockName": "삼성전자", "stockEndType": "stock"})
    )
    r = client.get("/api/settings/stocks/005930/validate").json()
    assert r["name"] == "삼성전자" and r["type"] == "STOCK"


@respx.mock
def test_validate_ticker_not_found_404():
    respx.get(f"{naver_client.MSTOCK_BASE}/999999/basic").mock(
        return_value=httpx.Response(404, json={})
    )
    assert client.get("/api/settings/stocks/999999/validate").status_code == 404


def test_api_keys_get_masked_and_update(monkeypatch, tmp_path):
    # 저장 파일을 임시 경로로 격리
    from app.services import api_keys
    monkeypatch.setattr(api_keys, "_KEYS_PATH", tmp_path / "api_keys.json")
    monkeypatch.setenv("NAVER_CLIENT_ID", "")
    monkeypatch.setenv("NAVER_CLIENT_SECRET", "")
    # 초기: 미설정
    body = client.get("/api/settings/api-keys").json()
    assert body["configured"]["naver"] is False
    # 업데이트
    r = client.put("/api/settings/api-keys", json={
        "NAVER_CLIENT_ID": "myid12345", "NAVER_CLIENT_SECRET": "mysecret"}).json()
    assert r["configured"]["naver"] is True
    assert r["keys"]["NAVER_CLIENT_ID"].startswith("myid")  # 마스킹
    assert "*" in r["keys"]["NAVER_CLIENT_ID"]
