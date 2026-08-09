#!/usr/bin/env bash
# K-Growth Insights — macOS dmg 빌드(하위 호환용 진입점).
#
# 실제 구현은 프로젝트 루트의 build-dmg.sh 한 곳에 있다. 빌드 스크립트가 두 벌이면
# 한쪽만 고쳐져 서로 다른 dmg가 나오므로, 여기서는 그대로 넘기기만 한다.
# 옵션도 그대로 전달된다: ./build.sh --arch arm64 --clean
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec "$ROOT/build-dmg.sh" "$@"
