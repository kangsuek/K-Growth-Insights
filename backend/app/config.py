"""Application settings loaded from environment (.env supported)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
DATA_DIR = BASE_DIR / "data"
CONFIG_DIR = BASE_DIR / "config"

DATABASE_PATH = os.getenv("DATABASE_PATH", str(DATA_DIR / "kgrowth.db"))
STOCKS_CONFIG_PATH = os.getenv("STOCKS_CONFIG_PATH", str(CONFIG_DIR / "stocks.json"))

# CORS origins for the Vite dev server
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")

# How many pages of daily prices to pull per collection run (60 rows/page).
PRICE_PAGES = int(os.getenv("PRICE_PAGES", "1"))
# The trend (trading flow) endpoint ignores the page param and always returns
# the ~20 most recent rows, so pagination is fixed at a single request.
TRADING_FLOW_PAGES = int(os.getenv("TRADING_FLOW_PAGES", "1"))
