# CLAUDE.md

이 파일은 K-Growth Insights 저장소에서 작업할 때의 가이드입니다.

## 프로젝트

한국 고성장 섹터 **ETF·주식** 분석 앱(웹 + macOS 데스크톱). 모든 시장 데이터는 **네이버 모바일 API**(JSON)에서 수집합니다. 전체 개요는 [README.md](./README.md) 참고.

## 스택

- 백엔드: **uv** + FastAPI + **SQLite 전용** (`backend/`). 다른 DB(PostgreSQL 등)를 도입하지 않습니다.
- 프론트엔드: **npm** + React + Vite + recharts + TanStack Query (`frontend/`)
- 데스크톱: Electron (`desktop/`) — 셸이 백엔드를 띄우고 빌드된 프론트를 로드

## 규칙 (Conventions)

- **주석은 한글로 작성합니다.**
- **커밋 메시지 설명(제목·본문)은 한글로 작성합니다.** (conventional-commits 접두사 `feat:`, `refactor:` 등은 영어 유지)
- 사용자에게 보여지는 모든 숫자는 **천 단위 구분 기호**를 사용합니다 (`toLocaleString('ko-KR')`).
- 백엔드는 **실제 사용하는(호출되는) 엔드포인트만** 유지합니다. 미사용 라우트·래퍼는 만들지 않습니다.
- 데이터 수집은 반드시 `services/naver_client.py`를 통해 네이버 모바일 API로 합니다.
- **백엔드 검증은 `uv run pytest`로만 합니다.** `uv run python -c "..."` 같은 raw 스크립트는 `DATABASE_PATH`가 실제 `backend/data/kgrowth.db`를 가리켜 실 데이터를 덮어씁니다 (`temp_db` 픽스처는 pytest 안에서만 적용). 부득이 실제 DB를 볼 땐 읽기 전용 쿼리만 — 오염 시 `collectors.collect_stock` / `collect_trading_flow(days=N)`로 재수집해 복구합니다.
- **기능 수정 후에는 항상 브라우저로 화면을 열어 검증합니다.** pytest·빌드로 먼저 확인한 뒤, 실제 화면에서 동작을 확인합니다.
- 커밋 메시지 끝에 다음을 추가합니다:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## 명령어

`just --list`로 전체 확인. 주요:
- `just setup` / `just db` — 설치 / SQLite 초기화
- `just backend` (:8000) / `just frontend` (:5173) — 둘 다 띄우려면 `./run.sh`, 내리려면 `./stop.sh` (로그는 `logs/`)
- `just collect` — 카탈로그 동기화 + 전체 수집
- `just test` / `just build`
- `just dmg` — macOS dmg 빌드(`./build-dmg.sh`). 구현은 이 스크립트 한 곳에만 둡니다

## 아키텍처

```
FastAPI (backend/app) ──/api──▶ React+Vite (frontend/src)
  routers/{etfs,scanner,data,settings,simulation,news,market}
    → services/{naver_client,collectors,catalog,scanner,repository,metrics,...} → SQLite
```

- 수집 계층: `naver_client`(네이버 API 정규화) → `collectors`·`catalog`·`scanner`(SQLite upsert)
- 조회 계층: `repository` → `routers`
- 추적 종목의 소스는 **DB(`stocks` 테이블)**. `backend/config/stocks.json`은 테이블이 비었을 때만 읽는 **최초 시딩용**입니다.

## 지표 규칙

- 수익률·변동성 계산은 `services/metrics.py` 한 곳에 둡니다. 화면마다 다른 값이 나오지 않게 하기 위함입니다.
- 수익률 기준일은 **네이버증권 표기와 동일**하게 맞춥니다 — 주간=7일 전, 월간=전월 같은 날, 연간(YTD)=전년도 마지막 거래일. 거래일 수(5·20거래일)로 잡지 않습니다.
- 기준일까지 시세가 없으면 값을 **만들지 않고 비웁니다**(네이버도 그렇게 합니다).
- 한 행의 시세·수익률·수급은 같은 거래일 기준이어야 합니다. 장 마감 전에는 당일 미확정 행을 쓰지 않습니다(`timeutil.is_close_confirmed`). 기준 거래일은 `stock_catalog.metrics_date`에 남습니다.
- 자세한 배경은 [README.md](./README.md#수익률-기준일) 참고.

## 범위

시세·매매동향·분봉, 펀더멘털(PER/PBR/NAV/구성종목), 뉴스, 인사이트, 스케줄러, 종목 발굴, 비교·시뮬레이션·포트폴리오까지 구현 완료.

남은 것: 종목 발굴의 수익률·수급 수집이 **전체 ETF + 코스피 상위 200 + 코스닥 상위 300**으로 제한돼 있어(`scanner.KOSPI_TOP_N_SUPPLY`/`KOSDAQ_TOP_N_SUPPLY`) 그 밖 종목은 값이 빕니다. 범위를 넓히려면 수집 시간(현재 1,654종목 약 21분)이 비례해 늘어납니다.
