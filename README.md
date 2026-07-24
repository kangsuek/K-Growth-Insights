# K-Growth Insights

한국 고성장 섹터 **ETF·주식** 분석 웹 애플리케이션. 모든 시장 데이터를 **네이버 모바일 API**(JSON)에서 수집합니다 — 데스크톱 HTML 스크래핑을 쓰지 않습니다.

## 왜 모바일 API인가

기존 방식(`finance.naver.com` HTML 파싱) 대비:

- **JSON** — 마크업/컬럼 위치 변경에 견고
- **정확한 개인 순매수** — `개인 = -(기관+외국인)` 근사가 아니라 실제값(`individualPureBuyQuant`)
- 등락률·외국인 보유율 등 계산 없이 바로 제공

## 데이터 출처 (수집 계층)

| 데이터 | 엔드포인트 |
|---|---|
| 일별 시세(OHLCV) | `m.stock.naver.com/api/stock/{code}/price` |
| 매매동향(외국인/기관/개인) | `m.stock.naver.com/api/stock/{code}/trend?trendType=1` |
| 분봉(분당 체결) | `api.stock.naver.com/chart/domestic/item/{code}/minute` |
| 종목명·유형(STOCK/ETF) | `m.stock.naver.com/api/stock/{code}/basic` |

## 아키텍처

```
FastAPI backend (backend/app)  ──/api──▶  React + Vite frontend (frontend/src)
        │
        ├─ services/naver_client.py   Naver 모바일 API 클라이언트(정규화)
        ├─ services/collectors.py     fetch → SQLite upsert
        ├─ services/repository.py     읽기 쿼리
        └─ routers/{stocks,data}.py   REST 엔드포인트
```

- 백엔드: **uv** + FastAPI + SQLite (`backend/data/kgrowth.db`)
- 프론트엔드: **npm** + React + Vite + recharts + TanStack Query
- 표시 숫자는 항상 천 단위 구분 기호 사용

## 빠른 시작

```bash
just setup      # 백엔드(uv) + 프론트엔드(npm) 의존성 설치, .env 생성
just db         # SQLite 초기화

# 터미널 2개
just backend    # :8000
just frontend   # :5173

just collect    # 종목 카탈로그 동기화 + 전체 데이터 수집(네이버 모바일 API)
```

브라우저에서 http://localhost:5173 접속.

## API 엔드포인트

시세·매매동향은 **항상 최신순(DESC)**, 분봉·지수 차트는 **시간순(ASC)** 으로 반환합니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/etfs/` | 추적 종목 목록 |
| GET | `/api/etfs/{ticker}` | 종목 상세 |
| GET | `/api/etfs/{ticker}/prices?days=60` | 일별 시세 (최신순) |
| GET | `/api/etfs/{ticker}/trading-flow?days=20` | 투자자별 매매동향 (최신순) |
| GET | `/api/etfs/{ticker}/intraday` | 최근 세션 분봉 (시간순) |
| GET | `/api/etfs/{ticker}/fundamentals` | 펀더멘털(주식 PER/PBR, ETF NAV·구성종목) |
| GET | `/api/news/{ticker}` | 종목 뉴스 |
| POST | `/api/data/sync-stocks` | 카탈로그 동기화(이름/유형 갱신) |
| POST | `/api/data/collect/{ticker}` | 단일 종목 수집 |
| POST | `/api/data/collect-all` | 전체 수집 |
| GET | `/api/data/stats` | 수집 통계 |

전체 목록은 서버 기동 후 http://localhost:8000/docs 에서 확인할 수 있습니다.

## 범위 (MVP)

현재: **시세 · 매매동향(외국인/기관/개인) · 분봉**. 추후: 펀더멘털(PER/PBR/NAV/구성종목), 종목 카탈로그 자동 확장, 뉴스, AI 인사이트, 스케줄러.

추적 종목은 `backend/config/stocks.json`에서 관리합니다.
