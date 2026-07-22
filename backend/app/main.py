"""K-Growth Insights — FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.database import init_db
from app.routers import data, etfs, market, settings, stocks
from app.services import api_keys, scheduler, stocks_sync

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # 저장된 API 키를 런타임에 적용(네이버 검색 등).
    api_keys.load_to_runtime()
    try:
        # Seed the catalog from stocks.json without hitting the network on boot;
        # names/types get refreshed by POST /api/data/sync-stocks.
        stocks_sync.sync_stocks(refresh_from_api=False)
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

app.include_router(stocks.router)
app.include_router(data.router)
app.include_router(etfs.router)
app.include_router(market.router)
app.include_router(settings.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "K-Growth Insights"}
