# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

한국 고성장 섹터 **ETF·주식** 분석 앱(웹 + macOS 데스크톱). 모든 시장 데이터는 **네이버 모바일 API**(JSON)에서 수집합니다. 화면·엔드포인트 전체 목록·수익률 기준일 배경은 [README.md](./README.md) 참고.

## 스택

- 백엔드: **uv** + FastAPI + **SQLite 전용** (`backend/`). 다른 DB(PostgreSQL 등)를 도입하지 않습니다.
- 프론트엔드: **npm** + React + Vite + recharts + TanStack Query (`frontend/`)
- 데스크톱: Electron (`desktop/`) — 셸이 `uv`로 백엔드용 venv를 사용자 워크스페이스에 만들고 백엔드를 띄운 뒤 빌드된 프론트(`frontend/dist`)를 로드

## 명령어

`just --list`로 전체 확인.

| 명령 | 내용 |
|---|---|
| `just setup` | 백엔드(uv)+프론트(npm) 의존성 설치, `.env` 생성 |
| `just db` | SQLite 스키마 초기화(멱등) |
| `just backend` / `just frontend` | API(:8000) / Vite(:5173) 개발 서버. 둘 다 띄우려면 `./run.sh`, 내리려면 `./stop.sh`(로그는 `logs/`) |
| `just collect` | 종목 카탈로그 동기화 + 전체 시세·수급 수집 |
| `just test` | 백엔드 pytest 전체(`cd backend && uv run pytest -q`) |
| `just build` | 프론트엔드 프로덕션 빌드 |
| `just dmg [-- --arch arm64\|x64\|both --clean --skip-tests --skip-install]` | macOS dmg 빌드(`./build-dmg.sh`). 구현은 이 스크립트 한 곳에만 둡니다 |

단일 테스트 실행:
```bash
cd backend && uv run pytest tests/test_scanner.py -q            # 파일 단위
cd backend && uv run pytest tests/test_scanner.py -k test_name  # 이름 매칭
npm --prefix frontend test -- --run src/pages/Dashboard.test.jsx # 프론트 단일 파일
npm --prefix frontend run lint                                  # ESLint (경고 0건 유지)
```

## 아키텍처

```
FastAPI (backend/app) ──/api──▶ React+Vite (frontend/src)
  routers/{etfs,data,scanner,settings,simulation,news,market}
    → services/{naver_client,collectors,catalog,scanner,repository,metrics,insights,
                 comparison,simulation,scheduler,jobs,ai_prompt,api_keys,app_settings,
                 stocks_sync} → SQLite (backend/data/kgrowth.db, 단일 파일)
```

- **수집 계층**: `naver_client`(네이버 모바일 API 정규화) → `collectors`·`catalog`·`scanner`(SQLite upsert). `scheduler`(APScheduler, 장중 주기 + 마감 후 수집)와 `jobs`(collect-all 백그라운드 실행 + 진행률)가 이 계층을 구동합니다.
- **조회 계층**: `repository`(읽기 전용 쿼리) → `routers`. `metrics`(수익률·변동성·추세지속성)·`insights`(전략·핵심포인트)·`comparison`(정규화·상관관계)·`simulation`(일시/적립식/포트폴리오)은 조회 시점에 계산하는 공용 로직입니다.
- **DB 스키마**(`database.py`): `stocks`(추적 종목), `prices`(일별 OHLCV), `trading_flow`(투자자별 순매수), `intraday_prices`(분봉), `stock_fundamentals`/`etf_fundamentals`/`etf_holdings`(펀더멘털 스냅샷), `stock_catalog`(종목 발굴용 전체 유니버스 — `stocks`와 별개), `news`.
- **추적 종목의 소스는 DB(`stocks` 테이블)**. `backend/config/stocks.json`은 테이블이 비었을 때만 읽는 **최초 시딩용**입니다(앱 기동마다 동기화하지 않음 — 삭제한 종목이 되살아나는 것을 방지).
- **`stock_catalog`는 `stocks`와 별개의 유니버스**입니다 — 종목 발굴(스캐너) 화면 전용 카탈로그로, 추적 종목 CRUD와 섞지 않습니다.
- **프론트엔드**: `pages/{Dashboard,ETFDetail,Screening,Comparison,Simulation,Portfolio,Settings}.jsx`가 각각 `/api`만으로 백엔드와 통신. `components/{charts,dashboard,etf,screening,comparison,simulation,portfolio,settings,news,common,layout}`로 화면별 분리.
- **데스크톱**(`desktop/main.js`): 커스텀 `app://` 프로토콜로 정적 프론트를 서빙하고 `/api/*`는 `localhost:18000` 백엔드로 프록시. 패키징 모드에서는 `~/Library/Application Support/K-Growth Insights/`에 `.venv`를 만들고 `requirements.txt` 해시가 바뀌면 재설치, DB·설정 파일을 최초 1회 시딩합니다.

## 규칙 (Conventions)

- **주석은 한글로 작성합니다.**
- **커밋 메시지 설명(제목·본문)은 한글로 작성합니다.** (conventional-commits 접두사 `feat:`, `refactor:` 등은 영어 유지)
- 사용자에게 보여지는 모든 숫자는 **천 단위 구분 기호**를 사용합니다 (`toLocaleString('ko-KR')`). 예외: 거래량은 `formatVolume`으로 K/M 단위 축약 표기(`1.2K`/`7.9M`)를 씁니다 — 자릿수가 큰 값이 많아 축약이 가독성에 유리합니다.
- 백엔드는 **실제 사용하는(호출되는) 엔드포인트만** 유지합니다. 미사용 라우트·래퍼는 만들지 않습니다.
- 데이터 수집은 반드시 `services/naver_client.py`를 통해 네이버 모바일 API로 합니다.
- **백엔드 검증은 `uv run pytest`로만 합니다.** `uv run python -c "..."` 같은 raw 스크립트는 `DATABASE_PATH`가 실제 `backend/data/kgrowth.db`를 가리켜 실 데이터를 덮어씁니다(`temp_db` 픽스처는 pytest 안에서만 적용). 부득이 실제 DB를 볼 땐 읽기 전용 쿼리만 — 오염 시 `collectors.collect_stock` / `collect_trading_flow(days=N)`로 재수집해 복구합니다.
- **기능 수정 후에는 항상 브라우저로 화면을 열어 검증합니다.** pytest·빌드로 먼저 확인한 뒤, 실제 화면에서 동작을 확인합니다.
- 커밋 메시지 끝에 다음을 추가합니다:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## 지표 규칙

- 수익률·변동성 계산은 `services/metrics.py` 한 곳에 둡니다. 화면마다 다른 값이 나오지 않게 하기 위함입니다.
- 수익률 기준일은 **네이버증권 표기와 동일**하게 맞춥니다 — 주간=7일 전, 월간=전월 같은 날, 연간(YTD)=전년도 마지막 거래일. 거래일 수(5·20거래일)로 잡지 않습니다.
- 기준일까지 시세가 없으면 값을 **만들지 않고 비웁니다**(네이버도 그렇게 합니다).
- 한 행의 시세·수익률·수급은 같은 거래일 기준이어야 합니다. 장 마감 전에는 당일 미확정 행을 쓰지 않습니다(`timeutil.is_close_confirmed`). 기준 거래일은 `stock_catalog.metrics_date`에 남습니다.
- **추세 지속성**(`trend_r2`/`trend_mdd`/`trend_win_rate`/`trend_above_ma`)은 연초대비 수익률만으로 '꾸준한 상승'을 가릴 수 없어 함께 저장합니다(폭락 후 반등도 YTD는 +). 판정 임계값은 `scanner.SUSTAINED_UPTREND` 한 곳에 둡니다.
- 자세한 배경은 [README.md](./README.md#수익률-기준일) 참고.

## 범위

시세·매매동향·분봉, 펀더멘털(PER/PBR/NAV/구성종목), 뉴스, 인사이트, 스케줄러, 종목 발굴, 비교·시뮬레이션·포트폴리오까지 구현 완료.

남은 것: 종목 발굴의 수익률·수급 수집이 **전체 ETF + 코스피 상위 200 + 코스닥 상위 300**으로 제한돼 있어(`scanner.KOSPI_TOP_N_SUPPLY`/`KOSDAQ_TOP_N_SUPPLY`) 그 밖 종목은 값이 빕니다. 범위를 넓히려면 수집 시간(현재 1,654종목 약 21분)이 비례해 늘어납니다.
