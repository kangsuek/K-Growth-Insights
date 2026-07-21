# K-Growth Insights — task runner

# List recipes
default:
    @just --list

# Install backend (uv) + frontend (npm) dependencies
setup:
    cd backend && uv venv && uv pip install -e ".[dev]"
    cd frontend && npm install
    cp -n .env.example .env || true

# Initialize / reset the SQLite database (idempotent)
db:
    cd backend && uv run python -c "from app.database import init_db; init_db()"

# Run the backend API on :8000
backend:
    cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run the frontend dev server on :5173
frontend:
    cd frontend && npm run dev

# Sync the ticker catalog and collect all market data from the Naver mobile API
collect:
    curl -s -X POST http://localhost:8000/api/data/sync-stocks
    curl -s -X POST http://localhost:8000/api/data/collect-all

# Run backend tests
test:
    cd backend && uv run pytest -q

# Build the frontend for production
build:
    cd frontend && npm run build
