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

### Phase 2 — 설정(Settings)  *(원래 8번 → 우선순위 상향)*
- [ ] 백엔드 ➕: `/settings/stocks*`(관리·정렬·검증·검색), `/settings/api-keys`
- [ ] `/data/scheduler-status`, `/data/reset`
- [ ] 페이지 연결(종목 관리·API 키·데이터 관리·일반 설정)

### Phase 3 — 종목 상세(ETFDetail)
- [ ] 상세 페이지 이식, 시세/매매동향/분봉/펀더멘털/인사이트/뉴스 연결
- [ ] 백엔드 ➕: `/etfs/{t}/metrics`(지표 계산), 필요 시 `batch-summary`

### Phase 4 — 종목발굴(Screening/Scanner)
- [ ] 백엔드 ➕: `/scanner`, `/scanner/themes`, `/scanner/recommendations`
- [ ] 페이지 연결

### Phase 5 — 비교(Comparison)
- [ ] 백엔드 ➕: `/etfs/compare`
- [ ] 페이지 연결

### Phase 6 — 시뮬레이션(Simulation)
- [ ] 백엔드 ➕: `/simulation/lump-sum`·`/dca`·`/portfolio`
- [ ] 페이지 연결

### Phase 7 — 포트폴리오(Portfolio)
- [ ] 포트폴리오 저장/조회(로컬 or 백엔드), 페이지 연결

### Phase 8 — 알림(Alerts)
- [ ] 백엔드 ➕: `alerts` 테이블 + CRUD(`/alerts/*`)
- [ ] 페이지 연결

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
