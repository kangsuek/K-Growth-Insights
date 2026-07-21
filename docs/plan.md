# K-Growth Insights — 작업 계획 (plan.md)

> 새 Claude Code 세션이 이 저장소(`~/pythonProject/K-Growth-Insights`)에서 이어서
> 작업하기 위한 핸드오프 문서. 이미 검증한 네이버 모바일 API 스펙을 포함하므로
> 엔드포인트를 다시 조사할 필요가 없다.

## 0. 프로젝트 규칙 (반드시 준수)

- **주석·커밋 메시지 설명은 한글**로 작성 (conventional-commits 접두사 `feat:`/`refactor:` 등은 영어 유지)
- **SQLite 전용** — 다른 DB 도입 금지
- 백엔드는 **실제 사용하는 엔드포인트만** 유지 (미사용 라우트/래퍼 금지)
- 표시 숫자는 **천 단위 구분 기호** (`toLocaleString('ko-KR')`, `f"{v:,}"`)
- 데이터 수집은 반드시 `backend/app/services/naver_client.py`를 통해 네이버 모바일 API로
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- 자세한 규칙: [../CLAUDE.md](../CLAUDE.md)

## 1. 현재 상태 (완료된 MVP)

- **범위**: 시세(OHLCV) · 매매동향(외국인/기관/개인) · 분봉 — 전부 네이버 모바일 API
- **백엔드**(FastAPI + SQLite, `backend/`):
  - `services/naver_client.py` — 네이버 API 정규화 클라이언트 (파싱 헬퍼 포함)
  - `services/collectors.py` — fetch → SQLite 멱등 upsert
  - `services/repository.py` — 조회 쿼리
  - `services/stocks_sync.py` — `config/stocks.json` → DB 동기화(이름/유형 API 갱신)
  - `routers/stocks.py`, `routers/data.py`
  - `database.py` — 스키마: `stocks`, `prices`, `trading_flow`, `intraday_prices`
- **프론트엔드**(React + Vite + recharts + TanStack Query, `frontend/`):
  - `pages/Dashboard.jsx`(목록+최신가), `pages/StockDetail.jsx`(차트 3종)
  - `components/{PriceChart,TradingFlowChart,IntradayChart}.jsx`
- **현행 API 엔드포인트**: `GET /api/stocks/summary`, `GET /api/stocks/{ticker}`,
  `GET /api/stocks/{ticker}/{prices,trading-flow,intraday}`,
  `POST /api/data/{collect-all,collect/{ticker},sync-stocks}`, `GET /api/data/stats`,
  `GET /api/health`
- **원격**: https://github.com/kangsuek/K-Growth-Insights (main)

## 2. 검증된 네이버 모바일 API 엔드포인트 (재조사 불필요)

공통 헤더: `User-Agent: Mozilla/5.0 ...`, `Referer: https://m.stock.naver.com`
`m.stock.naver.com`은 pageSize 최대 60(초과 시 400). 값은 콤마·`+/-`·`%` 문자열 →
`naver_client.py`의 `_to_int/_to_float/_bizdate_to_iso/_localdatetime_to_iso`로 정규화.

### 이미 사용 중
| 데이터 | 엔드포인트 | 주요 필드 |
|---|---|---|
| 일별 시세 | `m.stock.naver.com/api/stock/{code}/price?pageSize=60&page=N` | `localTradedAt`, `closePrice`, `openPrice`, `highPrice`, `lowPrice`, `accumulatedTradingVolume`, `fluctuationsRatio` |
| 매매동향 | `m.stock.naver.com/api/stock/{code}/trend?trendType=1` | `bizdate`(YYYYMMDD), `foreignerPureBuyQuant`, `organPureBuyQuant`, `individualPureBuyQuant`, `foreignerHoldRatio` — **page 무시, 최근 ~20건** |
| 분봉 | `api.stock.naver.com/chart/domestic/item/{code}/minute` | `localDateTime`(YYYYMMDDHHMMSS), `currentPrice`, `openPrice`, `highPrice`, `lowPrice`, `accumulatedTradingVolume`(분당) — 하루 약 381봉 |
| 기본정보 | `m.stock.naver.com/api/stock/{code}/basic` | `itemCode`, `stockName`, `stockEndType`(stock/etf), `closePrice`, `fluctuationsRatio`, `stockExchangeName` |

### 다음 작업에서 사용할 (검증 완료, 미구현)
| 데이터 | 엔드포인트 | 주요 필드 |
|---|---|---|
| 주식 펀더멘털(요약) | `m.stock.naver.com/api/stock/{code}/integration` → `totalInfos[]` | `PER`, `EPS`, `추정PER`, `추정EPS`, `PBR`, `BPS`, `배당수익률`, `주당배당금`, `시총`, `외인소진율`, `52주 최고/최저` (key/value 쌍) |
| 주식 재무 상세 | `m.stock.naver.com/api/stock/{code}/finance/annual`, `/finance/quarter` | `financeInfo.trTitleList`(기간), 매출/영업이익/EPS 등 |
| ETF 핵심지표 | `m.stock.naver.com/api/stock/{code}/integration` → `etfKeyIndicator` | `issuerName`, `marketValue`, `nav`, `totalNav`, `deviationRate`(괴리율), `totalFee`(보수), `dividendYieldTtm`, `returnRate1m/3m/1y` |
| ETF 구성종목/포트폴리오 | `m.stock.naver.com/api/stock/{code}/etfAnalysis` | `etfTop10MajorConstituentAssets[{seq,itemCode,itemName,stockCount,etfWeight}]`, `sectorPortfolioList`, `countryPortfolioList`, `assetPortfolioList`, `returnPerformanceList`, `navPerformanceList`, `dividend` |
| 종목 카탈로그 | `m.stock.naver.com/api/stocks/marketValue/{KOSPI\|KOSDAQ}?page=1&pageSize=60` | `stocks[{itemCode, stockName, closePrice, ...}]` (시총 순) |

> 참고: `stockEndType`으로 STOCK/ETF를 구분해 주식/ETF 펀더멘털 분기.

## 3. 남은 작업 (우선순위 순)

### 작업 1 — 펀더멘털 (주식 + ETF)
- **DB**: `stock_fundamentals`(ticker,date,per,pbr,eps,bps,dividend_yield,...),
  `etf_fundamentals`(ticker,date,nav,deviation_rate,total_fee,return_1m/3m/1y,...),
  `etf_holdings`(ticker,date,seq,item_code,item_name,weight)
- **naver_client**: `fetch_stock_fundamentals(code)`(integration.totalInfos 파싱),
  `fetch_etf_fundamentals(code)`(etfKeyIndicator), `fetch_etf_holdings(code)`(etfAnalysis Top10)
- **collectors**: `collect_stock`에 `stockEndType`에 따라 펀더멘털/ETF 수집 추가
- **엔드포인트**: `GET /api/stocks/{ticker}/fundamentals` (STOCK/ETF 분기 응답)
- **프론트**: 상세 화면에 펀더멘털 카드(주식: PER/PBR/배당, ETF: NAV/괴리율/보수/수익률/구성종목 Top10)

### 작업 2 — 종목 카탈로그 자동 확장
- `services/catalog.py`: `marketValue/{KOSPI,KOSDAQ}` 페이지네이션 수집 → `stocks` 테이블
- `POST /api/data/sync-catalog?market=&limit=` (또는 기존 sync-stocks 확장)
- 목표: `stocks.json` 수기 목록을 넘어 시총 상위 N 종목 자동 추적
- 주의: 종목 수 증가 → collect-all 시간↑. 백그라운드 수집/진행률 고려.

### 작업 3 — 뉴스
- 네이버 **검색 API**(`openapi.naver.com/v1/search/news.json`) — `NAVER_CLIENT_ID/SECRET` 필요
- 키 없으면 뉴스 비활성화(그레이스풀). `config.py`에 env 추가
- `news` 테이블, `GET /api/stocks/{ticker}/news`, 상세에 뉴스 타임라인

### 작업 4 — AI 인사이트(핵심포인트)
- 종목별 핵심포인트/전략 요약. 매매동향 판정은 **최근 5거래일 외국인 순매수 합계**를
  **평균 거래량 대비 비율(예: 5%)**로 스케일링해 "대규모/지속" 표기 (단일일·고정임계값 금지)
- 선택: Perplexity/LLM 연동은 키 있을 때만

### 작업 5 — 스케줄러
- APScheduler로 정기 수집(N분마다) + 일일 마감 수집(평일 15:40 KST)
- 서버 lifespan에서 기동, 종료 시 정리

### 작업 6 — 품질/UX
- 백엔드 테스트 확대(collectors 파싱을 respx로 모킹)
- 분봉 새로고침 스피너, 로딩/에러 상태 UX
- collect-all 백그라운드화 + 진행률 폴링

## 4. 개발/실행 명령

```bash
just setup      # uv + npm 설치, .env 생성
just db         # SQLite 초기화
just backend    # :8000  (터미널1)
just frontend   # :5173  (터미널2)
just collect    # 카탈로그 동기화 + 전체 수집
just test       # 백엔드 pytest
just build      # 프론트 빌드
```

## 5. 작업 방식 제안

- 작업 단위로 브랜치 없이 `main`에 커밋해도 무방(개인 저장소). 각 작업은 백엔드→프론트
  순으로 완성하고 커밋. 커밋 전 `just test` + `npm run build`로 회귀 확인.
- 새 엔드포인트 추가 시 라우트 순서 주의: 고정 경로(`/summary` 등)를 `/{ticker}`보다 먼저.
