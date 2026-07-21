# CLAUDE.md

이 파일은 K-Growth Insights 저장소에서 작업할 때의 가이드입니다.

## 프로젝트

한국 고성장 섹터 **ETF·주식** 분석 웹 앱. 모든 시장 데이터는 **네이버 모바일 API**(JSON)에서 수집합니다 — 데스크톱 HTML 스크래핑을 쓰지 않습니다. 전체 개요는 [README.md](./README.md) 참고.

## 스택

- 백엔드: **uv** + FastAPI + **SQLite 전용** (`backend/`). 다른 DB(PostgreSQL 등)를 도입하지 않습니다.
- 프론트엔드: **npm** + React + Vite + recharts + TanStack Query (`frontend/`)

## 규칙 (Conventions)

- **주석은 한글로 작성합니다.**
- **커밋 메시지 설명(제목·본문)은 한글로 작성합니다.** (conventional-commits 접두사 `feat:`, `refactor:` 등은 영어 유지)
- 사용자에게 보여지는 모든 숫자는 **천 단위 구분 기호**를 사용합니다 (`toLocaleString('ko-KR')`).
- 백엔드는 **실제 사용하는(호출되는) 엔드포인트만** 유지합니다. 미사용 라우트·래퍼는 만들지 않습니다.
- 데이터 수집은 반드시 `services/naver_client.py`를 통해 네이버 모바일 API로 합니다.
- 커밋 메시지 끝에 다음을 추가합니다:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## 명령어

`just --list`로 전체 확인. 주요:
- `just setup` / `just db` — 설치 / SQLite 초기화
- `just backend` (:8000) / `just frontend` (:5173)
- `just collect` — 카탈로그 동기화 + 전체 수집
- `just test` / `just build`

## 아키텍처

```
FastAPI (backend/app) ──/api──▶ React+Vite (frontend/src)
  routers/{stocks,data} → services/{collectors,repository,naver_client,stocks_sync} → SQLite
```

- 수집 계층: `naver_client`(네이버 API 정규화) → `collectors`(SQLite upsert)
- 조회 계층: `repository` → `routers`
- 추적 종목: `backend/config/stocks.json`

## 범위

MVP(시세·매매동향·분봉) 완료. 이후: 펀더멘털(PER/PBR/NAV/구성종목), 카탈로그 자동 확장, 뉴스, AI 인사이트, 스케줄러.
