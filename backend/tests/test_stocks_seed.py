"""stocks.json 시딩 테스트: 삭제한 종목이 재시작으로 되살아나지 않아야 한다."""
import json

from fastapi.testclient import TestClient

from app.main import app
from app.services import repository, stocks_sync

client = TestClient(app)


def _write_config(tmp_path, monkeypatch, entries):
    """임시 stocks.json을 만들고 시딩이 그 파일을 읽게 한다."""
    path = tmp_path / "stocks.json"
    path.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(stocks_sync, "STOCKS_CONFIG_PATH", str(path))
    return path


CONFIG = [
    {"ticker": "042700", "name": "한미반도체", "type": "STOCK", "theme": "반도체 장비"},
    {"ticker": "005930", "name": "삼성전자", "type": "STOCK", "theme": "반도체"},
]


def test_seeds_stocks_into_empty_db(tmp_path, monkeypatch):
    """빈 DB에는 stocks.json의 종목을 시딩한다(최초 실행)."""
    _write_config(tmp_path, monkeypatch, CONFIG)

    count = stocks_sync.seed_stocks_if_empty()

    assert count == 2
    tickers = {s["ticker"] for s in repository.list_stocks_full()}
    assert tickers == {"042700", "005930"}


def test_deleted_stock_is_not_revived_by_seeding(tmp_path, monkeypatch):
    """회귀 방지: 화면에서 삭제한 종목이 재시작(시딩)으로 되살아나면 안 된다.

    예전에는 앱이 뜰 때마다 stocks.json 전체를 UPSERT해서, 한미반도체처럼
    stocks.json에 남아 있는 종목이 삭제 후에도 계속 목록에 다시 나타났다.
    """
    _write_config(tmp_path, monkeypatch, CONFIG)
    stocks_sync.seed_stocks_if_empty()

    # 사용자가 화면에서 한미반도체를 삭제
    assert client.delete("/api/settings/stocks/042700").status_code == 200

    # 앱 재시작 = 시딩이 다시 돌아도 삭제한 종목은 돌아오지 않는다
    count = stocks_sync.seed_stocks_if_empty()

    assert count == 0, "이미 종목이 있는 DB에 다시 시딩했다"
    tickers = {s["ticker"] for s in repository.list_stocks_full()}
    assert "042700" not in tickers, "삭제한 한미반도체가 되살아났다"
    assert "005930" in tickers, "남아 있어야 할 종목이 사라졌다"


def test_seeding_keeps_user_added_stocks(tmp_path, monkeypatch):
    """사용자가 추가한 종목(stocks.json에 없는)도 시딩이 건드리지 않는다."""
    _write_config(tmp_path, monkeypatch, CONFIG)
    stocks_sync.seed_stocks_if_empty()

    client.post("/api/settings/stocks", json={
        "ticker": "000660", "name": "SK하이닉스", "type": "STOCK", "theme": "반도체",
    })

    stocks_sync.seed_stocks_if_empty()

    tickers = {s["ticker"] for s in repository.list_stocks_full()}
    assert "000660" in tickers


def test_seeding_skips_missing_config(tmp_path, monkeypatch):
    """stocks.json이 없으면 조용히 0을 반환한다(부팅을 막지 않는다)."""
    monkeypatch.setattr(stocks_sync, "STOCKS_CONFIG_PATH", str(tmp_path / "없는파일.json"))

    assert stocks_sync.seed_stocks_if_empty() == 0
