"""AI 투자분석 프롬프트 테스트: RAG context 생성 + /ai-prompt 엔드포인트 계약."""
from fastapi.testclient import TestClient

from app.database import get_connection
from app.main import app
from app.services import ai_prompt
from tests.conftest import seed_stock

client = TestClient(app)


def _seed_prices(ticker, closes, volume=1_000_000, change_pct=0.5):
    """closes(오래된→최신)로 prices를 채운다."""
    with get_connection() as conn:
        for i, c in enumerate(closes):
            conn.execute(
                """INSERT INTO prices (ticker, date, open_price, high_price,
                   low_price, close_price, volume, change_pct)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (ticker, f"2026-{(i // 28) + 1:02d}-{(i % 28) + 1:02d}",
                 c, c + 100, c - 100, c, volume, change_pct),
            )


def _seed_flow(ticker):
    with get_connection() as conn:
        for i in range(7):
            conn.execute(
                """INSERT INTO trading_flow (ticker, date, individual_net,
                   institutional_net, foreign_net, foreign_hold_ratio)
                   VALUES (?, ?, ?, ?, ?, 50)""",
                (ticker, f"2026-07-{i + 1:02d}", -100, 200, -50),
            )


# --- RAG context 생성 --------------------------------------------------------

def test_fetch_db_context_includes_sections():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_prices("005930", list(range(70000, 70030)))  # 30거래일 → 기술지표 계산 가능
    _seed_flow("005930")
    ctx = ai_prompt._fetch_db_context("005930", "삼성전자")
    assert "실제 DB 데이터: 삼성전자 (005930)" in ctx
    assert "가격 데이터" in ctx
    assert "매매동향" in ctx
    assert "RSI(14)" in ctx  # 기술적 분석 섹션


def test_get_prompt_replaces_placeholders():
    seed_stock("069500", "KODEX 200", "ETF")
    _seed_prices("069500", list(range(30000, 30030)))
    prompt = ai_prompt.get_prompt("069500", "KODEX 200")
    # 템플릿의 {종목명}/{티커코드}가 치환되어 남지 않아야 한다.
    assert "{종목명}" not in prompt and "{티커코드}" not in prompt
    assert "KODEX 200" in prompt and "069500" in prompt


def test_get_prompt_without_db_data_skips_context():
    seed_stock("005930", "삼성전자", "STOCK")
    prompt = ai_prompt.get_prompt("005930", "삼성전자", use_db_data=False)
    assert "실제 DB 데이터" not in prompt
    assert "삼성전자" in prompt


def test_multi_prompt_combines_stocks():
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    prompt = ai_prompt.get_multi_prompt(
        [{"ticker": "005930", "name": "삼성전자"},
         {"ticker": "000660", "name": "SK하이닉스"}]
    )
    assert "삼성전자" in prompt and "SK하이닉스" in prompt
    assert "통합 비교" in prompt


# --- 엔드포인트 계약 ---------------------------------------------------------

def test_ai_prompt_endpoint_shape():
    seed_stock("005930", "삼성전자", "STOCK")
    _seed_prices("005930", list(range(70000, 70030)))
    r = client.get("/api/etfs/005930/ai-prompt")
    assert r.status_code == 200
    body = r.json()
    assert body["ticker"] == "005930" and body["name"] == "삼성전자"
    assert isinstance(body["prompt"], str) and "삼성전자" in body["prompt"]


def test_ai_prompt_endpoint_404():
    assert client.get("/api/etfs/999999/ai-prompt").status_code == 404


def test_ai_prompt_multi_endpoint():
    seed_stock("005930", "삼성전자", "STOCK")
    seed_stock("000660", "SK하이닉스", "STOCK")
    r = client.post("/api/etfs/ai-prompt-multi", json={
        "stocks": [{"ticker": "005930", "name": "삼성전자"},
                   {"ticker": "000660", "name": "SK하이닉스"}]
    })
    assert r.status_code == 200
    assert "SK하이닉스" in r.json()["prompt"]


def test_ai_prompt_multi_requires_two():
    r = client.post("/api/etfs/ai-prompt-multi", json={
        "stocks": [{"ticker": "005930", "name": "삼성전자"}]
    })
    assert r.status_code == 400
