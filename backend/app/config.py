"""Application settings loaded from environment (.env supported)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
PROJECT_ROOT = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
CONFIG_DIR = BASE_DIR / "config"


def _resolve_path(value: str) -> str:
    """상대 경로를 프로젝트 루트 기준으로 고정 해석한다.

    .env의 `DATABASE_PATH=backend/data/kgrowth.db`는 프로젝트 루트 기준 경로인데,
    백엔드는 `cd backend && uvicorn ...`으로 실행돼 cwd가 backend/다. 그대로 두면
    `backend/backend/data/kgrowth.db`로 해석돼 DB가 두 벌로 갈라진다.
    """
    path = Path(value)
    return str(path if path.is_absolute() else (PROJECT_ROOT / path).resolve())


DATABASE_PATH = _resolve_path(os.getenv("DATABASE_PATH", str(DATA_DIR / "kgrowth.db")))
STOCKS_CONFIG_PATH = _resolve_path(
    os.getenv("STOCKS_CONFIG_PATH", str(CONFIG_DIR / "stocks.json"))
)

# 사용자 데이터(API 키 등)를 저장할 디렉터리. 항상 DB와 같은 곳에 둔다.
# 데스크톱 앱(Electron)은 DATABASE_PATH를 userData 아래로 지정하는데, 여기서
# BASE_DIR/data를 쓰면 읽기 전용이어야 하는 .app 번들 안에 파일을 쓰게 되고
# 재설치(DMG) 때 함께 지워진다.
APP_DATA_DIR = Path(DATABASE_PATH).parent

# CORS origins for the Vite dev server
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")

# How many pages of daily prices to pull per collection run (60 rows/page).
PRICE_PAGES = int(os.getenv("PRICE_PAGES", "1"))
# The trend (trading flow) endpoint ignores the page param and always returns
# the ~20 most recent rows, so pagination is fixed at a single request.
TRADING_FLOW_PAGES = int(os.getenv("TRADING_FLOW_PAGES", "1"))

# 네이버 검색 API(뉴스) 자격증명. 없으면 뉴스 수집을 비활성화한다(그레이스풀).
NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET")
# 종목당 수집·조회할 뉴스 최대 건수.
NEWS_DISPLAY = int(os.getenv("NEWS_DISPLAY", "10"))


def naver_search_enabled() -> bool:
    """네이버 검색 API 키가 모두 설정되어 있으면 True."""
    return bool(NAVER_CLIENT_ID and NAVER_CLIENT_SECRET)


# 스케줄러: 장중 N분마다 정기 수집 + 평일 15:40 KST 마감 수집.
SCHEDULER_ENABLED = os.getenv("SCHEDULER_ENABLED", "true").lower() == "true"
COLLECT_INTERVAL_MINUTES = int(os.getenv("COLLECT_INTERVAL_MINUTES", "10"))
# 전체 수집 병렬도(종목 단위 동시 수집 스레드 수). 수집 시간 단축용.
# 과도하면 네이버 API 제한에 걸릴 수 있어 기본 5로 제한.
COLLECT_CONCURRENCY = int(os.getenv("COLLECT_CONCURRENCY", "5"))

# 발굴(스캐너) 지표 재수집 가드: 장중에는 이 시간 이내 수집분을 최신으로 본다.
SCANNER_COLLECT_TTL_HOURS = int(os.getenv("SCANNER_COLLECT_TTL_HOURS", "6"))
