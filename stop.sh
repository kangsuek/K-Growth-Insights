#!/usr/bin/env bash
# K-Growth Insights — 모든 백엔드/프론트엔드 프로세스를 종료합니다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/.run"

BACKEND_PORT=8000
FRONTEND_PORT=5173

killed=0

# 포트를 점유한 프로세스 종료 (가장 확실한 방법)
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "▶ :$port 포트 프로세스 종료: $pids"
    kill $pids 2>/dev/null || true
    killed=1
  fi
done

# 이름으로 남은 프로세스 정리 (reload 워커 등)
pkill -f "uvicorn app.main:app" 2>/dev/null && killed=1 || true
pkill -f "vite" 2>/dev/null && killed=1 || true

# PID 파일 정리
rm -f "$LOG_DIR/backend.pid" "$LOG_DIR/frontend.pid" 2>/dev/null || true

if [ "$killed" -eq 1 ]; then
  echo "✔ 모든 백엔드/프론트엔드 프로세스를 종료했습니다."
else
  echo "실행 중인 백엔드/프론트엔드 프로세스가 없습니다."
fi
