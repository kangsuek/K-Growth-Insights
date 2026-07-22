# 5174 앱(ETFWeeklyReport 프론트) 이식 계획

> 목표: K-Growth-Insights 프론트엔드 화면을 `localhost:5174`에 보이는
> ETFWeeklyReport 프론트엔드와 **동일하게** 만든다. 데이터는 **내
> K-Growth-Insights 백엔드(:8000)** 에 연결하고, 프론트가 요구하는 기능은
> **백엔드에 엔드포인트를 추가**해 지원한다.

- 참조 소스: `~/pythonProject/ETFWeeklyReport/frontend`
- 대상: `~/pythonProject/K-Growth-Insights/frontend` (+ `backend`)
- 확정된 방향(사용자 결정):
  1. **범위**: 프론트 8페이지 전부 이식 (Tailwind·contexts·dnd-kit 포함)
  2. **데이터**: 내 K-Growth-Insights 백엔드에 연결
  3. **백엔드**: 필요한 기능은 엔드포인트 추가로 지원

## 1. 참조 프론트 구조

- 스택: React 18 + Vite + **Tailwind CSS(다크 테마)** + TanStack Query + recharts
  + @dnd-kit(드래그 정렬) + date-fns + react-markdown + html2pdf
- 라우팅(8페이지): `/`(Dashboard) · `/etf/:ticker`(ETFDetail) · `/portfolio` ·
  `/compare` · `/scanner`(종목발굴) · `/simulation` · `/alerts` · `/settings`
- 전역: SettingsContext · ToastContext · AlertContext · ErrorBoundary
- 레이아웃: Header(상단 내비) · Footer · 시장현황 · 자동갱신(30초)

## 2. 프론트 API ↔ 내 백엔드 매핑 (갭 분석)

범례: ✅ 있음(연결만) · 🔧 있음(응답 형태 변환 필요) · ➕ 신규 추가 필요

| 프론트 호출 | 참조 경로 | 내 백엔드 | 상태 |
|---|---|---|---|
| `etfApi.getAll` | `/etfs/` | `/stocks/summary` | 🔧 |
| `etfApi.getDetail` | `/etfs/{t}` | `/stocks/{t}` | 🔧 |
| `etfApi.getPrices` | `/etfs/{t}/prices` | `/stocks/{t}/prices` | ✅ |
| `etfApi.getTradingFlow` | `/etfs/{t}/trading-flow` | `/stocks/{t}/trading-flow` | ✅ |
| `etfApi.getIntraday` | `/etfs/{t}/intraday` | `/stocks/{t}/intraday` | ✅ |
| `etfApi.getFundamentals` | `/etfs/{t}/fundamentals` | `/stocks/{t}/fundamentals` | 🔧 |
| `etfApi.getInsights` | `/etfs/{t}/insights` | `/stocks/{t}/insights` | 🔧 |
| `etfApi.getMetrics` | `/etfs/{t}/metrics` | — | ➕ |
| `etfApi.compare` | `/etfs/compare` | — | ➕ |
| `etfApi.getBatchSummary` | `/etfs/batch-summary` | — | ➕ |
| `etfApi.getAIPrompt(Multi)` | `/etfs/{t}/ai-prompt` | — | ➕(선택) |
| `newsApi.getByTicker` | `/news/{t}` | `/stocks/{t}/news` | 🔧 |
| `dataApi.collectAll` | `/data/collect-all` | `/data/collect-all` | 🔧 |
| `dataApi.getStats` | `/data/stats` | `/data/stats` | ✅ |
| `dataApi.getCollectProgress` | `/data/collect-progress` | `/data/collect-status` | 🔧 |
| `dataApi.getSchedulerStatus` | `/data/scheduler-status` | — | ➕ |
| `dataApi.reset` | `/data/reset` | — | ➕ |
| `marketApi.getOverview` | `/market/overview` | — | ➕(코스피/코스닥 지수) |
| `marketApi.getIndexChart` | `/market/index/{c}/chart` | — | ➕ |
| `scannerApi.search` | `/scanner` | — | ➕ |
| `scannerApi.getThemes` | `/scanner/themes` | — | ➕ |
| `scannerApi.getRecommendations` | `/scanner/recommendations` | — | ➕ |
| `simulationApi.lumpSum/dca/portfolio` | `/simulation/*` | — | ➕ |
| `alertApi.*` | `/alerts/*` | — | ➕(CRUD + 테이블) |
| `settingsApi.getStocks/create/update/delete` | `/settings/stocks*` | 부분(`/stocks`,`/data/sync-*`) | ➕/🔧 |
| `settingsApi.reorder/validate/search` | `/settings/stocks/*` | — | ➕ |
| `settingsApi.getApiKeys/updateApiKeys` | `/settings/api-keys` | — | ➕ |

## 3. 단계별 계획 (각 단계 완료 시 커밋 + 이 문서 체크)

### Phase 1 — 프론트 셸 + 대시보드 (보이는 화면 우선) ✅
- [x] 프론트 소스/설정 이식: `src/`, `tailwind.config.js`, `postcss.config.js`,
      `index.html`, `public/`, Tailwind·dnd-kit 등 의존성
- [x] vite 설정 병합(내 프록시 `/api`→`:8000`, 포트 5173), `npm install`
- [x] **api.js는 그대로 유지**하고 내 백엔드가 프론트 계약(`/etfs`·`/market`·`/data`)을 제공
- [x] 백엔드 ➕: `GET /market/overview`(코스피/코스닥), `GET /market/index/{c}/chart`
- [x] 백엔드 ➕: `/etfs/`·`/etfs/batch-summary`·`/etfs/{t}/*`, `/data/scheduler-status`·
      `/data/collect-progress`·`DELETE /data/reset`
- [x] Dashboard·Header·Footer 렌더 확인(다크 테마, 시장현황, 종목 그리드, 정렬) — 브라우저 검증 완료
- [x] `npm run build` + 브라우저에서 5174와 동일 확인, 백엔드 테스트 69건 통과

### Phase 2 — 설정(Settings)  *(원래 8번 → 우선순위 상향)* ✅
- [x] 백엔드 ➕: `/settings/stocks*`(관리·정렬·검증·검색), `/settings/api-keys`,
      `/settings/ticker-catalog/*`
- [x] `/data/scheduler-status`, `/data/reset`(Phase 1에서 추가)
- [x] stocks 테이블 컬럼 확장(구매정보·검색키워드·sort_order) + 기존 DB 마이그레이션
- [x] 페이지 연결(종목 관리·API 키·데이터 관리·일반 설정) — 브라우저 검증 완료
- [x] **수집 시간 최소화**: collect-all 종목 단위 병렬화(ThreadPoolExecutor) + SQLite
      WAL/busy_timeout → 10종목 3.3s→0.7s(약 5배). `COLLECT_CONCURRENCY` env로 조정

### Phase 3 — 종목 상세(ETFDetail) ✅
- [x] 상세 페이지 연결(시세/매매동향/분봉/펀더멘털/인사이트/뉴스) — 브라우저 검증
- [x] `/etfs/{t}/insights`를 **원본 insights_service 로직 그대로** 재구현
      (strategy{short/medium/long_term, recommendation, comment}, key_points[], risks[];
      returns 1w/1m/ytd·연환산 변동성, 외국인 임계값=5%×평균거래량×일수)
- [x] `/etfs/{t}/prices`를 원본과 동일 최신순(DESC)으로 반환(상세 '최근 가격' 정상화)
- [x] fundamentals 구성종목 필드 매핑(item_*→stock_code/stock_name/daily_change_pct)
- [x] `/api/news/{ticker}` 라우터 추가(원본 NewsListResponse 형태 {news, analysis})
- [x] 레거시 `/api/stocks/{ticker}/insights` + 미사용 InsightsResponse 제거
- 참고: `/etfs/{t}/metrics`는 어느 페이지도 사용 안 함 → 미구현(불필요)

### Phase 4 — 종목발굴(Screening/Scanner) ✅
- [x] 백엔드 ➕: `/scanner`(검색·필터·정렬·페이지), `/scanner/themes`,
  `/scanner/recommendations`(프리셋 5), `/scanner/collect-data`·`collect-progress`·`cancel-collect`
- [x] stock_catalog 스크리닝 지표 컬럼(close/daily/volume/weekly/monthly/ytd/foreign/inst) + 수집기
- [x] market 규약: ETF는 market='ETF', 주식은 KOSPI/KOSDAQ(원본 동일) — 프론트 필터 매칭
- [x] 페이지 연결(브라우저 검증: 203종목 지표 수집, ETF 목록·수익률·거래량 렌더)
- 참고: **발굴은 `stock_catalog`(종목목록수집 유니버스)를 대상**으로 한다(워치리스트와 별개).

> **개념 구분(중요)**: `stocks`=관심종목 워치리스트(종목관리→대시보드),
> `stock_catalog`=발굴 유니버스(종목목록수집→종목발굴). 두 목록은 분리 저장한다.

### Phase 5 — 비교(Comparison) ✅
- [x] 백엔드 ➕: `GET /etfs/compare?tickers=&start_date=&end_date=`
- [x] 정규화 가격(시작=100)·통계(기간/연환산 수익률·변동성·최대낙폭·샤프)·상관관계 행렬
      (순수 파이썬 계산, numpy 없이) — 원본 응답 형태 재현
- [x] 페이지 연결(브라우저 검증: 종목 선택→정규화차트·산점도·히트맵·성과표)

### Phase 6 — 시뮬레이션(Simulation) ✅
- [x] 백엔드 ➕: `POST /simulation/lump-sum`·`/dca`·`/portfolio` — 원본 로직 재현
      (shares=int(금액//가격), 평가액=주수×종가+잔여금, max_gain/loss, price_series/
      monthly_data/daily_series)
- [x] 페이지 연결(브라우저 검증: 일시투자 실행→평가액 추이 차트 렌더)

### Phase 7 — 포트폴리오(Portfolio) ✅
- [x] 신규 백엔드 불필요 — getAll(구매정보)+batchSummary(현재가)로 클라이언트 계산
- [x] `/etfs/`가 stocks의 실제 구매정보(purchase_date/price/quantity) 반환하도록 수정
- [x] 페이지 연결(브라우저 검증: 투자금 330만·평가 378만·+14.65%, 비중/수익률 차트)

### Phase 8 — 알림(Alerts) ✅
- [x] 백엔드 ➕: `alert_rules`·`alert_history` 테이블 + CRUD
      (POST/GET`/{ticker}`/PUT/DELETE, POST`/trigger`, GET`/history/{ticker}`)
- [x] 페이지 연결(브라우저 검증: 알림 관리 화면·필터, 규칙 CRUD API 확인)
      규칙은 상세 PriceTargetPanel에서 관리, 트리거는 클라이언트 체크→기록

### Phase 9 — 마감/정리
- [ ] 미사용 코드·미지원 안내 정리, 접근성/반응형 점검
- [ ] 프론트 테스트(vitest) 정비, 전체 회귀
- [ ] **frontend/package.json 정리**: 불필요하거나 버전이 오래된 의존성 삭제·개선(사용자 요청)

## 4. 주의/원칙

- CLAUDE.md 규칙 유지: 주석·커밋 한글, 천 단위 구분, **SQLite 전용**,
  데이터 수집은 `naver_client`(네이버 모바일 API) 경유, 사용하는 엔드포인트만 유지.
- 백엔드 추가 기능도 네이버 모바일 API/기존 수집 데이터 기반으로 구현(HTML 스크래핑 금지).
- 각 Phase는 **백엔드 추가 → 프론트 연결 → 빌드/브라우저 검증 → 커밋** 순.
- 기존 K-Growth-Insights 백엔드 테스트(61건) 회귀 없이 유지.

## 5. 진행 로그

- (작성) 계획 수립. Phase 1 착수 예정.
