# 데스크톱 앱 배포 (서명·공증)

macOS 앱을 다른 기기에 배포하려면 **코드 서명**과 **공증(notarization)** 이 모두 필요하다.
서명만 하면 Gatekeeper가 "확인되지 않은 개발자" 경고를 띄우고, 공증까지 마쳐야 경고 없이 열린다.

서명하지 않아도 배포 자체는 된다. 다만 받는 쪽에서 시스템 설정 > 개인정보 보호 및 보안에서
"확인 없이 열기"를 눌러야 실행된다. `v1.0.0` 릴리스가 이 상태다.

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

---

# 인증서 발급 절차

한 번만 하면 되는 작업이다. 순서대로 따라간다.

| 단계 | 결과물 | 걸리는 시간 |
|---|---|---|
| 1. Apple Developer Program 가입 | 멤버십 (연 $99) | 1~며칠 (심사) |
| 2. 키체인에서 CSR 생성 | `.certSigningRequest` + 개인 키 | 1분 |
| 3. Developer ID Application 인증서 발급 | `.cer` (키체인 설치) | 5분 |
| 4. `.p12`로 내보내기 | CI용 인증서 파일 | 2분 |
| 5. 공증 자격증명 발급 | 앱 암호 + Team ID | 5분 |

무료 Apple ID로는 **Developer ID 인증서를 받을 수 없다.** 유료 멤버십이 유일한 경로다.

## 1. Apple Developer Program 가입

[developer.apple.com/programs](https://developer.apple.com/programs/) → Enroll. 연 $99.

- **개인(Individual)**: Apple ID + 결제 + 신원 확인. 보통 1~2일.
- **조직(Organization)**: D-U-N-S 번호가 추가로 필요하고 더 오래 걸린다.

개인으로 가입하면 본인이 곧 Account Holder라 인증서 발급 권한이 바로 생긴다.
조직 계정이라면 **Account Holder만** Developer ID 인증서를 만들 수 있으니 권한을 먼저 확인한다.

## 2. CSR(인증서 서명 요청) 만들기

Mac에서 **키체인 접근**을 열고
메뉴 → **키체인 접근 → 인증서 지원 → 인증 기관에서 인증서 요청…**

| 항목 | 값 |
|---|---|
| 사용자 이메일 주소 | Apple Developer 계정 이메일 |
| 일반 이름 | 본인 이름 (식별용) |
| CA 이메일 주소 | **비워둔다** |
| 요청 항목 | **디스크에 저장됨** + **본인이 키 쌍 정보 지정** 체크 |
| 키 크기 / 알고리즘 | 2048비트 / RSA |

`CertificateSigningRequest.certSigningRequest` 파일이 저장된다.
이때 **개인 키가 로그인 키체인에 함께 생성**된다. 이 키를 잃으면 인증서를 다시 발급받아야 한다.

## 3. Developer ID Application 인증서 발급

[developer.apple.com/account](https://developer.apple.com/account) →
**Certificates, Identifiers & Profiles** → Certificates → **+**

- 종류는 **Developer ID Application**을 고른다.
  `Developer ID Installer`(pkg용)나 `Apple Development`(개발용)가 아니다.
- Profile Type은 **G2 Sub-CA**(최신)를 선택한다.
- 2단계에서 만든 `.certSigningRequest`를 업로드 → Continue → **Download**

받은 `developerID_application.cer`를 **더블클릭**하면 키체인에 설치된다.

```
security find-identity -v -p codesigning
```
`Developer ID Application: 이름 (TEAMID)` 항목이 보이면 성공이다.
이 상태면 로컬에서 `npm run build`가 자동으로 서명한다.

## 4. `.p12`로 내보내기 (GitHub Actions용)

CI 러너에는 키체인이 없으니 인증서와 개인 키를 묶어 `.p12`로 내보낸다.

키체인 접근 → 왼쪽 **로그인** 키체인 → **나의 인증서** 범주 →
해당 인증서 우클릭 → **내보내기…** → 포맷 `개인 정보 교환(.p12)` → 암호 설정

```
base64 -i cert.p12 -o cert.p12.b64   # CSC_LINK 에 넣을 문자열
```

`.p12`와 그 암호는 **저장소에 커밋하지 않는다.** 안전한 곳에 백업해 둔다.

## 5. 공증 자격증명

아래 **둘 중 하나**만 있으면 된다.

**(A) Apple ID + 앱 암호** — 간단하다.

| 값 | 얻는 곳 |
|---|---|
| `APPLE_ID` | Apple Developer 계정 이메일 |
| `APPLE_APP_SPECIFIC_PASSWORD` | [appleid.apple.com](https://appleid.apple.com) → 로그인 및 보안 → **앱 암호** → 생성 (`xxxx-xxxx-xxxx-xxxx`) |
| `APPLE_TEAM_ID` | developer.apple.com/account → Membership details → Team ID (10자) |

계정 비밀번호가 아니라 반드시 **앱 암호**를 쓴다.

**(B) App Store Connect API 키** — CI에 권장(만료·회수 관리가 쉽다).

```
APPLE_API_KEY=/path/to/AuthKey_XXXXXXXX.p8
APPLE_API_KEY_ID=XXXXXXXXXX
APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```
App Store Connect → 사용자 및 액세스 → 통합에서 발급한다.

`check-signing-env.js`는 (A)·(B) 둘 다 인정하지만, **`release.yml`이 현재 넘기는 건 (A)뿐이다.**
CI에서 (B)를 쓰려면 워크플로의 dmg 빌드 스텝 `env:`에 `APPLE_API_KEY` 등을 추가해야 한다.

> 이 값들은 **저장소에 커밋하지 않는다.** 셸에서 export 하거나 CI 시크릿으로 넣는다.

---

# 실행

## 로컬 빌드

인증서를 키체인에 설치했다면 서명은 자동이다. 공증 자격증명만 환경변수로 넣는다.

```
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX

cd desktop
npm run check:signing   # 준비 상태만 확인
npm run build:release
```

공증은 Apple 서버에 업로드해 심사받는 과정이라 아키텍처당 보통 **수 분** 걸린다.
완료되면 `release/`에 dmg가 생성되고 스테이플링(공증 티켓 첨부)까지 끝난다.

## GitHub Actions

`.github/workflows/release.yml`이 `v*` 태그 push에 반응해 dmg를 만들고 Release에 올린다.
**`CSC_LINK` 시크릿이 있으면 서명·공증 경로**, 없으면 미서명으로 빌드하고 릴리스 노트에
Gatekeeper 우회 안내를 붙인다. 시크릿을 등록하는 것 말고 워크플로를 고칠 필요는 없다.

시크릿 등록 (값이 화면에 찍히지 않는다):

```
gh secret set CSC_LINK < cert.p12.b64
gh secret set CSC_KEY_PASSWORD            # 프롬프트에 p12 암호 입력
gh secret set APPLE_ID
gh secret set APPLE_APP_SPECIFIC_PASSWORD
gh secret set APPLE_TEAM_ID
```

릴리스 생성:

```
git tag v1.0.1 && git push origin v1.0.1
```

러너는 `macos-14`(arm64)이며 x64 dmg는 electron-builder가 교차 빌드로 함께 만든다.

# 결과 검증

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

미서명 빌드는 `codesign -dv`가 `flags=0x20002(adhoc, linker-signed)`를 내고
`Identifier=Electron`으로 보인다. 서명된 빌드는 여기에 팀 식별자가 들어간다.

# Hardened Runtime 예외

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

# 알려진 제약

- **`uv` 의존**: dmg에는 파이썬 환경이 들어가지 않는다. `main.js`가 실행 시 `uv`를 찾아
  사용자 워크스페이스에 `.venv`를 만든다. 설치 대상 기기에 `uv`가 없으면 백엔드가 뜨지 않고,
  최초 실행 시 패키지 설치 시간이 걸린다. 배포 대상이 넓다면 파이썬을 함께 번들하는 방식을
  검토해야 한다.
- **인증서 개수**: Developer ID Application 인증서는 팀당 최대 5개까지만 만들 수 있다.
  실수로 여러 개 만들지 않는다.
- **인증서 만료**: 유효기간은 5년이다. 만료돼도 **이미 공증된 앱은 계속 실행된다**(타임스탬프가
  붙기 때문). 만료 후엔 새 빌드만 못 한다.
- **개인 키 분실**: 2단계에서 생긴 개인 키를 잃으면 인증서를 처음부터 다시 발급받아야 한다.
  `.p12` 백업이 사실상 유일한 보험이다.
- **공증 실패 시**: `xcrun notarytool log <submission-id>`로 거절 사유를 확인한다.
  대부분 서명되지 않은 중첩 바이너리나 Hardened Runtime 누락이 원인이다.
