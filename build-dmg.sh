#!/usr/bin/env bash
# K-Growth Insights — macOS 데스크톱 앱(dmg)을 빌드합니다.
#
# 사용법:
#   ./build-dmg.sh                  # arm64 + x64 둘 다 (기본)
#   ./build-dmg.sh --arch arm64     # Apple Silicon만
#   ./build-dmg.sh --arch x64       # Intel만
#   ./build-dmg.sh --clean          # release/ 를 비우고 새로 빌드
#   ./build-dmg.sh --skip-tests     # 테스트 없이 빌드(빠름, 배포용으로는 비권장)
#   ./build-dmg.sh --skip-install   # npm install / uv sync 생략(의존성이 이미 최신일 때)
set -euo pipefail
trap 'echo "" >&2; echo "✘ 빌드 실패 (build-dmg.sh:${LINENO})" >&2' ERR

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP="$ROOT/desktop"
RELEASE="$DESKTOP/release"

ARCH="both"
CLEAN=0
RUN_TESTS=1
DO_INSTALL=1

while [ $# -gt 0 ]; do
  case "$1" in
    --arch) ARCH="${2:-}"; shift 2 ;;
    --clean) CLEAN=1; shift ;;
    --skip-tests) RUN_TESTS=0; shift ;;
    --skip-install) DO_INSTALL=0; shift ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "알 수 없는 옵션: $1 (--help 참고)" >&2; exit 2 ;;
  esac
done

case "$ARCH" in
  arm64|x64|both) ;;
  *) echo "ERROR: --arch 는 arm64 | x64 | both 중 하나여야 합니다 (받은 값: $ARCH)" >&2; exit 2 ;;
esac

echo "=== K-Growth Insights dmg 빌드 ==="
echo "  프로젝트: $ROOT"
echo "  대상 아키텍처: $ARCH"
echo ""

# ── 0. 사전 확인 ──────────────────────────────────────────────────────────
[ "$(uname -s)" = "Darwin" ] || { echo "ERROR: dmg는 macOS에서만 만들 수 있습니다." >&2; exit 1; }
for cmd in uv node npm; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERROR: '$cmd' 가 없습니다. 설치 후 다시 실행하세요." >&2; exit 1; }
done

# 서명 인증서 유무를 미리 알려준다. 없으면 electron-builder가 조용히 건너뛰므로,
# 다 만들고 나서야 서명이 안 된 걸 알게 되는 일을 막는다.
if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
  SIGNED="예"
else
  SIGNED="아니오"
  echo "⚠ 'Developer ID Application' 인증서가 없어 서명 없이 빌드합니다."
  echo "  다른 Mac에서 열면 Gatekeeper가 막습니다(우클릭 → 열기로 우회)."
  echo "  배포용은 인증서를 넣고 'cd desktop && npm run build:release'(서명+공증)를 쓰세요."
  echo ""
fi

if [ "$CLEAN" -eq 1 ]; then
  echo "▶ release/ 정리"
  rm -rf "$RELEASE"
else
  # 이전 산출물이 남아 있으면 이번 빌드 결과와 섞여 보인다. 지우진 않고 알려만 준다.
  # (release/ 가 아직 없는 최초 빌드에서는 글롭이 매치되지 않는데, ls를 그대로 쓰면
  #  set -euo pipefail 아래에서 조용히 스크립트가 죽으므로 배열 글롭으로 안전하게 센다.)
  shopt -s nullglob
  existing_dmgs=("$RELEASE"/*.dmg)
  shopt -u nullglob
  old="${#existing_dmgs[@]}"
  if [ "$old" != "0" ]; then
    echo "▶ 기존 dmg ${old}개가 release/ 에 있습니다(같은 이름이면 덮어씁니다). --clean 으로 비울 수 있습니다."
  fi
fi

# ── 1. 의존성 ─────────────────────────────────────────────────────────────
if [ "$DO_INSTALL" -eq 1 ]; then
  echo "▶ 의존성 설치"
  # --extra dev 없이 sync하면 pytest가 빠져 아래 테스트 단계가 깨진다.
  # 패키징에는 tests/를 넣지 않으므로(electron-builder.yml filter) 앱 크기와는 무관하다.
  (cd "$ROOT/backend" && uv sync --extra dev)
  (cd "$ROOT/frontend" && npm install --silent)
  (cd "$DESKTOP" && npm install --silent)
fi

# ── 2. 테스트 ─────────────────────────────────────────────────────────────
if [ "$RUN_TESTS" -eq 1 ]; then
  echo "▶ 테스트 (--skip-tests 로 생략 가능)"
  (cd "$ROOT/backend" && uv run pytest -q)
  (cd "$ROOT/frontend" && npx vitest run --silent)
fi

# ── 3. 아이콘 + 프론트엔드 빌드 ───────────────────────────────────────────
# 프론트엔드 dist는 dmg에 그대로 실려 간다(electron-builder.yml extraResources).
# 소스만 고치고 빌드를 빼먹으면 옛 화면이 담긴 dmg가 나오므로 항상 새로 빌드한다.
echo "▶ 앱 아이콘 생성"
(cd "$DESKTOP" && npm run generate-icons --silent)

echo "▶ 프론트엔드 빌드"
(cd "$ROOT/frontend" && npm run build)

# ── 4. dmg 빌드 ───────────────────────────────────────────────────────────
# arm64·x64를 한 번에 돌리면 두 dmg가 같은 볼륨 이름으로 동시에 마운트돼
# hdiutil detach가 실패한다. 반드시 순차 실행한다(electron-builder.yml 주석 참고).
build_one() {
  echo "▶ dmg 빌드 ($1)"
  (cd "$DESKTOP" && npm run "build:$1")
}
if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "both" ]; then build_one arm64; fi
if [ "$ARCH" = "x64" ]   || [ "$ARCH" = "both" ]; then build_one x64; fi

# ── 5. 검증 ───────────────────────────────────────────────────────────────
echo ""
echo "▶ dmg 검증"
shopt -s nullglob
dmgs=("$RELEASE"/*.dmg)
if [ ${#dmgs[@]} -eq 0 ]; then
  echo "ERROR: dmg가 생성되지 않았습니다." >&2
  exit 1
fi
for dmg in "${dmgs[@]}"; do
  if hdiutil verify "$dmg" >/dev/null 2>&1; then
    echo "  ✔ $(basename "$dmg")  체크섬 정상"
  else
    echo "  ✘ $(basename "$dmg")  체크섬 실패" >&2
    exit 1
  fi
done

echo ""
echo "=== 빌드 완료 ==="
echo "  코드 서명: $SIGNED"
echo "  출력 위치: $RELEASE"
for dmg in "${dmgs[@]}"; do
  printf '    %s  (%s)\n' "$(basename "$dmg")" "$(du -h "$dmg" | cut -f1 | tr -d ' ')"
done
echo ""
echo "  Apple Silicon → '-arm64.dmg',  Intel Mac → 접미사 없는 '.dmg'"
echo "  앱을 처음 실행하면 uv로 파이썬 환경을 만들므로 uv가 설치돼 있어야 합니다."
