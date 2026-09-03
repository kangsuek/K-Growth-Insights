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


def _seed_catalog(rows):
    """stock_catalog(발굴 유니버스)에 종목을 시드."""
    with get_connection() as conn:
        for ticker, name, type_, market in rows:
            conn.execute(
                "INSERT INTO stock_catalog (ticker, name, type, market) VALUES (?, ?, ?, ?)",
                (ticker, name, type_, market),
            )


def test_search_matches_name_and_ticker():
    # 검색은 워치리스트가 아니라 발굴 카탈로그를 대상으로 한다
    _seed_catalog([
        ("005930", "삼성전자", "STOCK", "KOSPI"),
        ("005935", "삼성전자우", "STOCK", "KOSPI"),
        ("000660", "SK하이닉스", "STOCK", "KOSPI"),
    ])
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


def test_scheduler_settings_get_and_update(monkeypatch, tmp_path):
    from app import config
    from app.services import app_settings

    monkeypatch.setattr(app_settings, "_SETTINGS_PATH", tmp_path / "app_settings.json")
    monkeypatch.setattr(config, "INTRADAY_COLLECT_INTERVAL_MINUTES", 1)

    body = client.get("/api/settings/scheduler").json()
    assert body["intraday_collect_interval_minutes"] == 1

    r = client.put("/api/settings/scheduler", json={"intraday_collect_interval_minutes": 5})
    assert r.status_code == 200
    assert r.json()["intraday_collect_interval_minutes"] == 5
    assert config.INTRADAY_COLLECT_INTERVAL_MINUTES == 5

    saved = app_settings._load()
    assert saved["intraday_collect_interval_minutes"] == 5


def test_scheduler_settings_update_out_of_range_400(monkeypatch, tmp_path):
    from app.services import app_settings

    monkeypatch.setattr(app_settings, "_SETTINGS_PATH", tmp_path / "app_settings.json")
    r = client.put("/api/settings/scheduler", json={"intraday_collect_interval_minutes": 999})
    assert r.status_code == 400


def test_collect_interval_settings_get_and_update(monkeypatch, tmp_path):
    from app import config
    from app.services import app_settings

    monkeypatch.setattr(app_settings, "_SETTINGS_PATH", tmp_path / "app_settings.json")
    monkeypatch.setattr(config, "COLLECT_INTERVAL_MINUTES", 10)

    body = client.get("/api/settings/scheduler").json()
    assert body["collect_interval_minutes"] == 10

    r = client.put("/api/settings/scheduler", json={"collect_interval_minutes": 5})
    assert r.status_code == 200
    assert r.json()["collect_interval_minutes"] == 5
    assert config.COLLECT_INTERVAL_MINUTES == 5
    # 분봉 주기는 함께 보내지 않았으니 그대로 유지된다.
    assert r.json()["intraday_collect_interval_minutes"] == config.INTRADAY_COLLECT_INTERVAL_MINUTES

    saved = app_settings._load()
    assert saved["collect_interval_minutes"] == 5


def test_collect_interval_settings_update_out_of_range_400(monkeypatch, tmp_path):
    from app.services import app_settings

    monkeypatch.setattr(app_settings, "_SETTINGS_PATH", tmp_path / "app_settings.json")
    r = client.put("/api/settings/scheduler", json={"collect_interval_minutes": 999})
    assert r.status_code == 400


def test_scanner_ttl_settings_get_and_update(monkeypatch, tmp_path):
    from app import config
    from app.services import app_settings

    monkeypatch.setattr(app_settings, "_SETTINGS_PATH", tmp_path / "app_settings.json")
    monkeypatch.setattr(config, "SCANNER_COLLECT_TTL_HOURS", 6)

    body = client.get("/api/settings/scheduler").json()
    assert body["scanner_collect_ttl_hours"] == 6

    r = client.put("/api/settings/scheduler", json={"scanner_collect_ttl_hours": 12})
    assert r.status_code == 200
    assert r.json()["scanner_collect_ttl_hours"] == 12
    assert config.SCANNER_COLLECT_TTL_HOURS == 12
    # 다른 두 주기는 함께 보내지 않았으니 그대로 유지된다.
    assert r.json()["collect_interval_minutes"] == config.COLLECT_INTERVAL_MINUTES

    saved = app_settings._load()
    assert saved["scanner_collect_ttl_hours"] == 12


def test_scanner_ttl_settings_update_out_of_range_400(monkeypatch, tmp_path):
    from app.services import app_settings

    monkeypatch.setattr(app_settings, "_SETTINGS_PATH", tmp_path / "app_settings.json")
    r = client.put("/api/settings/scheduler", json={"scanner_collect_ttl_hours": 999})
    assert r.status_code == 400


def test_update_stock_clears_optional_fields():
    """빈 값(null)으로 수정하면 선택 필드가 실제로 지워져야 한다.

    회귀 방지: repository.update_stock이 `data[col] is not None` 조건으로
    명시적 null을 무시해, 테마 등을 비워도 기존 값이 남아 "수정이 저장되지
    않는" 것처럼 보이던 결함. (매입가·보유수량·구매일은 이제 거래내역에서만
    바뀌므로 이 엔드포인트로는 보내도 무시된다 — test_transactions.py 참고.)
    """
    client.post("/api/settings/stocks", json={
        "ticker": "111111", "name": "테스트종목", "type": "STOCK",
        "theme": "반도체", "search_keyword": "테스트",
    })

    # 종목 수정 폼이 빈 칸을 비웠을 때 실제로 보내는 payload와 같은 형태
    r = client.put("/api/settings/stocks/111111", json={
        "name": "테스트종목", "type": "STOCK", "theme": None, "search_keyword": None,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["theme"] is None, "테마가 지워지지 않았다"
    assert body["search_keyword"] is None, "검색 키워드가 지워지지 않았다"
    # 필수 필드는 그대로 유지
    assert body["name"] == "테스트종목" and body["type"] == "STOCK"


def test_update_stock_omitted_fields_are_untouched():
    """보내지 않은 필드는 기존 값을 유지해야 한다(부분 수정 의미 유지)."""
    client.post("/api/settings/stocks", json={
        "ticker": "222222", "name": "보존종목", "type": "STOCK", "theme": "2차전지",
    })

    r = client.put("/api/settings/stocks/222222", json={"search_keyword": "보존"})
    assert r.status_code == 200
    body = r.json()
    assert body["search_keyword"] == "보존"
    assert body["theme"] == "2차전지", "보내지 않은 테마가 지워졌다"


def test_create_and_update_stock_ignore_legacy_purchase_fields():
    """매입가/수량/구매일은 이제 거래내역 API로만 바뀐다 — 이 필드로 보내면 그냥 무시된다."""
    r = client.post("/api/settings/stocks", json={
        "ticker": "444444", "name": "레거시필드종목", "type": "STOCK",
        "purchase_date": "2026-01-02", "purchase_price": 10000, "quantity": 5,
    })
    assert r.status_code == 201
    assert r.json()["purchase_price"] is None
    assert r.json()["quantity"] is None

    r = client.put("/api/settings/stocks/444444", json={
        "name": "레거시필드종목", "purchase_price": 99999, "quantity": 1,
    })
    assert r.status_code == 200
    assert r.json()["purchase_price"] is None
    assert r.json()["quantity"] is None


def test_update_stock_required_fields_not_nulled():
    """name·type은 NOT NULL이므로 null을 보내도 기존 값을 유지해야 한다."""
    client.post("/api/settings/stocks", json={
        "ticker": "333333", "name": "필수유지", "type": "ETF",
    })

    r = client.put("/api/settings/stocks/333333", json={"name": None, "type": None})
    assert r.status_code == 200
    assert r.json()["name"] == "필수유지"
    assert r.json()["type"] == "ETF"
