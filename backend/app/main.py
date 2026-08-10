"""K-Growth Insights — FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.database import init_db
from app.routers import (
    data, etfs, market, news, scanner, settings, simulation,
)
from app.services import api_keys, app_settings, scheduler, stocks_sync

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # 저장된 API 키를 런타임에 적용(네이버 검색 등).
    api_keys.load_to_runtime()
    # 저장된 스케줄러 설정(분봉 수집 주기 등)을 런타임에 적용.
    app_settings.load_to_runtime()
    try:
        # 추적 종목이 하나도 없을 때(최초 실행)만 stocks.json으로 시딩한다.
        # 매번 동기화하면 사용자가 삭제한 종목이 재시작 때 되살아난다.
        stocks_sync.seed_stocks_if_empty()
    except Exception as exc:  # noqa: BLE001 - never block startup on seeding
        logger.warning("stock seeding skipped: %s", exc)
    # 자동 수집 스케줄러 기동(장중 N분 + 평일 15:40 KST 마감).
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown()


app = FastAPI(
    title="K-Growth Insights",
    description="Korean growth-sector ETF/stock analytics powered by the Naver mobile API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router)
app.include_router(etfs.router)
app.include_router(market.router)
app.include_router(settings.router)
app.include_router(news.router)
app.include_router(scanner.router)
app.include_router(simulation.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "K-Growth Insights"}
