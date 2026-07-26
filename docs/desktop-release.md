# 데스크톱 앱 배포 (서명·공증)

macOS 앱을 다른 기기에 배포하려면 **코드 서명**과 **공증(notarization)** 이 모두 필요하다.
서명만 하면 Gatekeeper가 "확인되지 않은 개발자" 경고를 띄우고, 공증까지 마쳐야 경고 없이 열린다.

## 빌드 명령

| 명령 | 서명 | 공증 | 용도 |
|---|---|---|---|
| `npm run build` | 인증서 있으면 자동 | 안 함 | 개발·내부 확인용 |
| `npm run build:dir` | 안 함 | 안 함 | 패키징 확인(dmg 없음, 가장 빠름) |
| `npm run build:release` | 필수 | 함 | 배포용 |
| `npm run check:signing` | — | — | 자격증명만 미리 점검 |

`npm run build`는 인증서가 없으면 서명을 건너뛰고 계속한다(`skipped macOS application code signing`).
그래서 개발 중에는 아무 설정 없이 그대로 쓸 수 있다.

`npm run build:release`는 시작 전에 `scripts/check-signing-env.js`로 자격증명을 점검한다.
빠진 것이 있으면 수 분간 패키징한 뒤 마지막에 실패하는 대신, 바로 무엇이 없는지 알려준다.

## 준비물

### 1. 코드 서명 인증서

Apple Developer Program(연 $99) 가입이 필요하다. **Developer ID Application** 인증서를 발급받는다.

- 로컬 빌드: 인증서를 키체인에 설치하면 electron-builder가 자동으로 찾는다.
- CI 빌드: `.p12`로 내보내 환경변수로 주입한다.
  ```
  CSC_LINK=/path/to/cert.p12      # 또는 base64 문자열
  CSC_KEY_PASSWORD=<p12 암호>
  ```

인증서가 제대로 있는지 확인:
```
security find-identity -v -p codesigning
```
`Developer ID Application: ...` 항목이 보여야 한다.

### 2. 공증 자격증명

아래 **둘 중 하나**만 설정하면 된다.

**(A) Apple ID + 앱 암호** — 간단하다.
```
APPLE_ID=you@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
```
앱 암호는 [appleid.apple.com](https://appleid.apple.com) → 로그인 및 보안 → 앱 암호에서 발급한다.
계정 비밀번호가 아니라 반드시 앱 암호를 쓴다. Team ID는 Apple Developer → Membership에서 확인한다.

**(B) App Store Connect API 키** — CI에 권장(만료·회수 관리가 쉽다).
```
APPLE_API_KEY=/path/to/AuthKey_XXXXXXXX.p8
APPLE_API_KEY_ID=XXXXXXXXXX
APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```
App Store Connect → 사용자 및 액세스 → 통합에서 발급한다.

> 이 값들은 **저장소에 커밋하지 않는다.** 셸에서 export 하거나 CI 시크릿으로 넣는다.

## 실행

```
cd desktop
npm run build:release
```

공증은 Apple 서버에 업로드해 심사받는 과정이라 아키텍처당 보통 **수 분** 걸린다.
완료되면 `release/`에 dmg가 생성되고 스테이플링(공증 티켓 첨부)까지 끝난다.

## 결과 검증

```
# 서명 확인 — "Developer ID Application" 과 Runtime 플래그가 보여야 한다
codesign -dv --verbose=4 "release/mac-arm64/K-Growth Insights.app"

# 서명 유효성
codesign --verify --deep --strict "release/mac-arm64/K-Growth Insights.app"

# 공증 티켓이 붙었는지
xcrun stapler validate "release/K-Growth Insights-1.0.0-arm64.dmg"

# Gatekeeper 통과 여부 (배포 전 최종 확인)
spctl -a -vvv -t install "release/K-Growth Insights-1.0.0-arm64.dmg"
```

`spctl`이 `accepted` / `source=Notarized Developer ID`를 내면 배포 준비가 된 것이다.

## Hardened Runtime 예외

공증에는 Hardened Runtime이 필수다. 이 앱은 Electron 셸이 `uv`로 파이썬 백엔드를 띄우고
localhost로 통신하므로, `build/entitlements.mac.plist`에 다음 예외를 둔다.

| 항목 | 이유 |
|---|---|
| `allow-jit` | V8(JIT). Electron 필수 |
| `allow-unsigned-executable-memory` | V8이 요구 |
| `disable-library-validation` | uv가 설치한 파이썬 패키지의 `.so`/`.dylib`는 우리 인증서로 서명돼 있지 않다. 끄지 않으면 백엔드 기동이 차단된다 |
| `allow-dyld-environment-variables` | 파이썬 자식 프로세스에 PATH·VIRTUAL_ENV 등을 넘긴다 |
| `network.client` | 네이버 API 호출 |
| `network.server` | 백엔드가 localhost에 FastAPI 서버를 연다 |

App Sandbox는 쓰지 않는다(Developer ID 배포에는 불필요하며, 파이썬 실행과 충돌한다).

## 알려진 제약

- **`uv` 의존**: dmg에는 파이썬 환경이 들어가지 않는다. `main.js`가 실행 시 `uv`를 찾아
  사용자 워크스페이스에 `.venv`를 만든다. 설치 대상 기기에 `uv`가 없으면 백엔드가 뜨지 않고,
  최초 실행 시 패키지 설치 시간이 걸린다. 배포 대상이 넓다면 파이썬을 함께 번들하는 방식을
  검토해야 한다.
- **공증 실패 시**: `xcrun notarytool log <submission-id>`로 거절 사유를 확인한다.
  대부분 서명되지 않은 중첩 바이너리나 Hardened Runtime 누락이 원인이다.
