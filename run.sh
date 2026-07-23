#!/usr/bin/env bash
# K-Growth Insights — 백엔드(:8000)와 프론트엔드(:5173)를 함께 실행합니다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"
LOG_DIR="$ROOT/logs"
BACKEND_LOG_DIR="$LOG_DIR/backend"
FRONTEND_LOG_DIR="$LOG_DIR/frontend"
mkdir -p "$RUN_DIR" "$BACKEND_LOG_DIR" "$FRONTEND_LOG_DIR"

BACKEND_PORT=8000
FRONTEND_PORT=5173

# 이미 실행 중이면 먼저 정리
"$ROOT/stop.sh" >/dev/null 2>&1 || true

# 로그 파일: 고정 파일 하나만 사용(매 실행마다 덮어쓰기, 백업 미생성)
BACKEND_LOG="$BACKEND_LOG_DIR/backend.log"
FRONTEND_LOG="$FRONTEND_LOG_DIR/frontend.log"

echo "▶ 백엔드 시작 (:$BACKEND_PORT)"
(
  cd "$ROOT/backend"
  uv run uvicorn app.main:app --reload --host 0.0.0.0 --port "$BACKEND_PORT"
) >"$BACKEND_LOG" 2>&1 &
echo $! >"$RUN_DIR/backend.pid"

echo "▶ 프론트엔드 시작 (:$FRONTEND_PORT)"
(
  cd "$ROOT/frontend"
  npm run dev -- --port "$FRONTEND_PORT"
) >"$FRONTEND_LOG" 2>&1 &
echo $! >"$RUN_DIR/frontend.pid"

echo ""
echo "✔ 실행 완료"
echo "  - 백엔드:    http://localhost:$BACKEND_PORT   (로그: logs/backend/backend.log)"
echo "  - 프론트엔드: http://localhost:$FRONTEND_PORT   (로그: logs/frontend/frontend.log)"
echo ""
echo "로그 실시간 보기: tail -f logs/backend/backend.log"
echo "종료하려면:       ./stop.sh"
