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
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 자세한 규칙: [../CLAUDE.md](../CLAUDE.md)

## 1. 현재 상태

작업 1~6이 모두 끝났다(§9 체크리스트). 화면·엔드포인트 전체 목록은 [../README.md](../README.md) 참고.

- **범위**: 시세 · 매매동향 · 분봉 · 펀더멘털 · 뉴스 · 인사이트 · 스케줄러 ·
  종목 발굴 · 비교 · 시뮬레이션 · 포트폴리오 — 전부 네이버 모바일 API
- **백엔드**(FastAPI + SQLite, `backend/`):
  - `services/naver_client.py` — 네이버 API 정규화 클라이언트
  - `services/{collectors,catalog,scanner}.py` — fetch → SQLite 멱등 upsert
  - `services/repository.py` — 조회 쿼리
  - `services/metrics.py` — 화면 공통 수익률·변동성
    (기준일은 네이버증권과 동일 — [README 수익률 기준일](../README.md#수익률-기준일))
  - `app/timeutil.py` — KST 변환 + 장 시간·종가 확정 판정
  - `routers/{etfs,scanner,data,settings,simulation,news,market}.py`
  - `database.py` — `stocks`, `prices`, `trading_flow`, `intraday_prices`,
    `stock_catalog`, `stock_fundamentals`, `etf_fundamentals`, `etf_holdings`, `news`
- **프론트엔드**(React + Vite + recharts + TanStack Query, `frontend/`):
  `pages/{Dashboard,ETFDetail,Screening,Comparison,Simulation,Portfolio,Settings}.jsx`
- **데스크톱**: Electron(`desktop/`). dmg 빌드는 루트 `./build-dmg.sh` 하나로 통일
- **테스트**: 백엔드 pytest 187건 / 프론트 vitest 384건
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

### 이후 추가로 사용 중
| 데이터 | 엔드포인트 | 주요 필드 |
|---|---|---|
| 주식 펀더멘털(요약) | `m.stock.naver.com/api/stock/{code}/integration` → `totalInfos[]` | `PER`, `EPS`, `추정PER`, `추정EPS`, `PBR`, `BPS`, `배당수익률`, `주당배당금`, `시총`, `외인소진율`, `52주 최고/최저` (key/value 쌍) |
| 주식 재무 상세 | `m.stock.naver.com/api/stock/{code}/finance/annual`, `/finance/quarter` | `financeInfo.trTitleList`(기간), 매출/영업이익/EPS 등 |
| ETF 핵심지표 | `m.stock.naver.com/api/stock/{code}/integration` → `etfKeyIndicator` | `issuerName`, `marketValue`, `nav`, `totalNav`, `deviationRate`(괴리율), `totalFee`(보수), `dividendYieldTtm`, `returnRate1m/3m/1y` |
| ETF 구성종목/포트폴리오 | `m.stock.naver.com/api/stock/{code}/etfAnalysis` | `etfTop10MajorConstituentAssets[{seq,itemCode,itemName,stockCount,etfWeight}]`, `sectorPortfolioList`, `countryPortfolioList`, `assetPortfolioList`, `returnPerformanceList`, `navPerformanceList`, `dividend` |
| 종목 카탈로그 | `m.stock.naver.com/api/stocks/marketValue/{KOSPI\|KOSDAQ}?page=1&pageSize=60` | `stocks[{itemCode, stockName, closePrice, ...}]` (시총 순) |

> 참고: `stockEndType`으로 STOCK/ETF를 구분해 주식/ETF 펀더멘털 분기.

## 3. 남은 작업

작업 1~6(펀더멘털·카탈로그·뉴스·인사이트·스케줄러·품질)은 모두 끝났다. 상세 이력은 §9.

### 발굴 수집 범위 확대 (미착수, 판단 필요)

수익률·수급은 종목마다 개별 조회라 비싸서 **전체 ETF + 코스피 상위 200 + 코스닥 상위 300**
(`scanner.KOSPI_TOP_N_SUPPLY`/`KOSDAQ_TOP_N_SUPPLY`)만 수집한다. 그 밖 종목(약 2,600개)은
주간·월간·연간·외국인·기관이 빈다. 네이버에는 값이 있으므로 순전히 수집 범위 문제다.

| 안 | 대상 | 예상 수집 시간(동시성 5 기준) |
|---|---|---|
| 현행 | 1,654종목 | 약 21분 |
| 절충 | 코스피 500 / 코스닥 800 | 약 30분 |
| 전체 | 4,295종목 | 약 55분 |

시간이 비례해 늘고 네이버 API 부하도 커지므로, 넓힐지 여부는 결정이 필요하다.

### 코드 서명·공증 (미착수)

`Developer ID Application` 인증서가 없어 dmg가 미서명 상태다. 다른 Mac에서는 Gatekeeper
우회가 필요하다. 절차는 [desktop-release.md](./desktop-release.md).

## 4. 개발/실행 명령

```bash
just setup      # uv + npm 설치, .env 생성
just db         # SQLite 초기화
just backend    # :8000  (터미널1)
just frontend   # :5173  (터미널2)
just collect    # 카탈로그 동기화 + 전체 수집
just test       # 백엔드 pytest
just build      # 프론트 빌드
just dmg        # macOS dmg 빌드 (= ./build-dmg.sh)

./run.sh        # 백엔드+프론트를 한 번에 백그라운드 기동 (로그: logs/)
./stop.sh       # 둘 다 종료
```

- **API 탐색**: 서버 기동 후 http://localhost:8000/docs (Swagger UI, 자동 생성)에서
  전체 엔드포인트를 확인·호출할 수 있다.
- **환경 변수**: `just setup`이 `.env.example` → `.env`를 생성한다. 기본값(SQLite 경로,
  CORS, 수집 페이지 수)으로 바로 동작하며, 필요 시 `.env`만 수정한다.

## 5. 작업 방식 제안

- 작업 단위로 브랜치 없이 `main`에 커밋해도 무방(개인 저장소). 각 작업은 백엔드→프론트
  순으로 완성하고 커밋. 커밋 전 `just test` + `npm run build`로 회귀 확인.
- 새 엔드포인트 추가 시 라우트 순서 주의: 고정 경로(`/summary` 등)를 `/{ticker}`보다 먼저.

## 6. 백엔드 작업 흐름

백엔드는 **아래에서 위로**(수집 → 조회 → 라우트) 쌓고, 각 단계를 라이브 API로
즉시 검증한다. 예시는 작업 1(펀더멘털) 기준.

### 파일 수정 순서 (계층별)
1. **`services/naver_client.py`** — fetch 함수 추가 (예: `fetch_stock_fundamentals(code)`).
   네이버 응답을 정규화해 반환. 스펙/필드는 [2절](#2-검증된-네이버-모바일-api-엔드포인트-재조사-불필요) 참고.
2. **`database.py`** — `SCHEMA`에 테이블 추가. `init_db()`는 멱등이라 `just db` 재실행으로 반영.
3. **`services/collectors.py`** — fetch 결과를 SQLite에 upsert. `collect_stock`에서
   `stockEndType`(stock/etf)에 따라 분기.
4. **`services/repository.py`** — 조회 쿼리 (예: `get_fundamentals(ticker)`).
5. **`models.py`** — Pydantic 응답 모델.
6. **`routers/etfs.py`**(또는 해당 라우터) — 엔드포인트 추가.
   ⚠️ 고정 경로는 `/{ticker}`보다 **먼저** 선언.

### 검증은 pytest로 (필수)

**`uv run python -c "..."` 로 앱 모듈을 임포트해 검증하지 않는다.** `DATABASE_PATH`가 실제
`backend/data/kgrowth.db`를 가리켜 실 데이터를 덮어쓴다(격리 픽스처 `temp_db`는 pytest 안에서만
적용된다). 새 fetch 함수는 **respx로 네이버 응답을 모킹한 테스트**로 검증한다(§8).

```bash
cd backend && uv run pytest -q
```

실행 중인 서버에 REST로 확인하는 것은 안전하다(읽기 경로).

```bash
curl -s http://localhost:8000/api/etfs/005930/fundamentals | python3 -m json.tool

# 라우트 등록 확인
curl -s http://localhost:8000/openapi.json | python3 -c "import sys,json;[print(m.upper(),p) for p,ms in json.load(sys.stdin)['paths'].items() for m in ms]"
```

부득이 실제 DB를 들여다볼 땐 **읽기 전용 쿼리만** 쓴다. 오염되면
`collectors.collect_stock` / `collect_trading_flow(days=N)`로 재수집해 복구한다.

### 원칙
- **백엔드/프론트 커밋 분리.** 백엔드 완성 → 커밋 → 프론트 → 커밋.
- 커밋 전 `pytest`(+ 프론트 변경 시 `npm run build`), 그리고 **브라우저로 화면 확인**.
- 각 작업/세부 항목 완료 시 [9절 체크리스트](#9-진행-체크리스트) 갱신.

## 7. 네이버 API 주의사항 / 트러블슈팅

- **pageSize ≤ 60**: 초과 시 400. 더 많은 데이터는 `page`로 페이지네이션.
- **`trend`는 `page`를 무시**하고 항상 최근 ~20건만 반환 → 매매동향은 약 20거래일이 한계.
- **빈 배열 = 장 마감·휴장·미상장**이지 오류가 아니다. 빈 결과는 저장/캐시하지 말고
  다음 수집에서 다시 시도되게 둔다.
- **`Referer: https://m.stock.naver.com` 헤더 필수** (없으면 차단될 수 있음).
  `naver_client.HEADERS`를 그대로 사용.
- **대량 수집 rate-limit 주의**: 현재 `naver_client`에는 재시도·요청 간격 로직이 **없다**.
  카탈로그(수백 종목) 작업 전에 요청 간 짧은 지연(예: 0.2~0.5s)과 429/타임아웃 재시도를 먼저 추가할 것.
- **문자열 포맷**: 응답 값은 콤마·`+/-`·`%` 문자열, `bizdate`=YYYYMMDD,
  `localDateTime`=YYYYMMDDHHMMSS. 반드시 `naver_client`의 정규화 헬퍼를 거친다.
- **라우트 404 vs 405**: 고정 경로를 `/{ticker}`보다 먼저 선언하지 않으면
  `/summary` 같은 경로가 `{ticker}`로 잡혀 404가 난다.
- **분봉 거래량**: 필드명은 `accumulatedTradingVolume`이지만 분봉에서는 **분당 거래량**(누적 아님).

## 8. 테스트 전략

- 순수 파싱(정규화 헬퍼)은 네트워크 없이 단위 테스트 (`tests/test_naver_client.py` 참고).
- 수집기/클라이언트의 HTTP는 **respx**(이미 dev 의존성)로 네이버 응답을 모킹한다.
  실제 네이버를 호출하지 않아 빠르고 결정적이다.

최소 예시 (`httpx` + `respx`):

```python
import respx, httpx
from app.services import naver_client as nc

@respx.mock
def test_fetch_daily_prices_parses_naver():
    respx.get(url__regex=r".*/api/stock/005930/price").mock(
        return_value=httpx.Response(200, json=[
            {"localTradedAt": "2026-07-21", "closePrice": "260,000",
             "openPrice": "249,000", "highPrice": "263,500", "lowPrice": "243,000",
             "accumulatedTradingVolume": 33369432, "fluctuationsRatio": "6.15"},
        ])
    )
    rows = nc.fetch_daily_prices("005930", pages=1)
    assert rows[0]["close_price"] == 260000.0
    assert rows[0]["volume"] == 33369432
```

- collectors 테스트는 임시 SQLite(`DATABASE_PATH`를 tmp로 오버라이드)에 upsert 후
  행 수·값을 검증한다.
- 커밋 전 `cd backend && uv run pytest -q`.

## 9. 진행 체크리스트

> 각 작업을 마치면 해당 항목을 `- [x]`로 갱신하고 커밋한다. 다음 세션이
> 이 목록만 보고도 어디까지 됐는지 알 수 있게 유지한다.

### MVP (완료)
- [x] 네이버 모바일 API 클라이언트(`naver_client.py`) — 시세/매매동향/분봉/기본정보
- [x] 수집기(`collectors.py`) + 조회(`repository.py`) + SQLite 스키마
- [x] 엔드포인트: summary / 상세 / prices / trading-flow / intraday / collect-* / stats
- [x] 프론트: 대시보드 + 상세(차트 3종), 한글 주석, 천 단위 구분
- [x] GitHub 원격 연결 및 푸시

### 작업 1 — 펀더멘털 (주식 + ETF)
- [x] DB 스키마 추가: `stock_fundamentals`, `etf_fundamentals`, `etf_holdings`
- [x] `naver_client`: `fetch_stock_fundamentals` / `fetch_etf_fundamentals` / `fetch_etf_holdings`
- [x] `collectors`: 종목 `type`에 따라 주식/ETF 펀더멘털 수집 분기
- [x] `GET /api/stocks/{ticker}/fundamentals`
- [x] 프론트: 상세에 펀더멘털 카드(주식 PER/PBR/배당, ETF NAV/괴리율/보수/수익률/구성종목)
- [x] `just test` + `npm run build` 후 커밋

### 작업 2 — 종목 카탈로그 자동 확장
- [x] `services/catalog.py`: `marketValue/{KOSPI,KOSDAQ}` 페이지네이션 수집 (수기 theme 보존)
- [x] `POST /api/data/sync-catalog?market=&limit=`
- [~] collect-all 백그라운드/진행률 고려 → 종목 수↑ 시 collect-all 시간↑ 확인. 전체 백그라운드화·진행률 폴링은 작업 6로 이관
- [x] 커밋

### 작업 3 — 뉴스
- [x] `config.py`에 `NAVER_CLIENT_ID/SECRET` env (없으면 비활성화, `naver_search_enabled()`)
- [x] 네이버 검색 API 수집(`fetch_news`·`collect_news`, 태그 제거·날짜 ISO) + `news` 테이블
- [x] `GET /api/stocks/{ticker}/news`
- [x] 프론트: 상세에 뉴스 타임라인(NewsTimeline)
- [x] 커밋

### 작업 4 — AI 인사이트(핵심포인트)
- [x] 매매동향 판정: 최근 5거래일 순매수 합계 ÷ 일평균 거래량 비율(5%/15% 티어·지속성)
- [x] 핵심포인트/전략 요약 생성 로직(`services/insights.py`, 규칙 기반·실시간 계산)
- [x] `GET /api/stocks/{ticker}/insights`
- [x] 프론트: 상세에 인사이트 카드(InsightsCard)
- [x] 커밋

### 작업 5 — 스케줄러
- [x] APScheduler 정기 수집(장중 N분, 오프아워 스킵) + 일일 마감 수집(평일 15:40 KST)
- [x] lifespan 기동/정리(`services/scheduler.py`, BackgroundScheduler)
- [x] 커밋

### 작업 6 — 품질/UX (상시)
- [x] collectors 파싱 테스트(respx 모킹) 확대 — 시세·매매동향·분봉·펀더멘털·뉴스·인사이트·스케줄러·잡 (61건)
- [x] 분봉 새로고침 스피너, 로딩/에러 UX(ChartState·spinner)
- [x] collect-all 백그라운드(`services/jobs.py`, 데몬 스레드) + 진행률 폴링(GET /collect-status)
- [x] 종목 발굴 '데이터 수집' 진행률 바 — 설정 '종목 목록 수집'과 동일 형식(`components/common/StepProgressBar`로 공용화), 백엔드 scanner 진행률에 단계(ETF→코스피→코스닥)·percent·message 추가
- [x] 발굴 수집 freshness 가드 + `force` 파라미터(원본 `catalog_data_collector.check_freshness` 이식) — 최신이면 `{status:'fresh'}`로 스킵
- [x] 시각 표시 KST 일괄 정리 — DB는 UTC(`datetime('now')`) 유지, API 경계에서 `app/timeutil.to_kst_iso()`로 `+09:00` ISO 변환(마지막 수집·카탈로그 갱신·펀더멘털·알림)
- [x] 분봉 차트 상승률(%) 표시 — 응답에 `change_pct` 추가, 툴팁 전일비 옆 % 병기 + 우측 상승률 축(0%=전일 종가)
- [x] 알림 설정 기능 전체 제거 — 상세 알림 패널·감지 훅·헤더 벨/알림 페이지·`/api/alerts` 라우터·`alert_rules`/`alert_history` 스키마
- [x] 미사용 정리 — 프론트가 호출하지 않던 `/api/stocks/*` 라우터와 그 라우터만 쓰던 응답 모델, 미사용 컴포넌트 `StatsSummary` 제거(테스트는 `/api/etfs`·`/api/news`로 이전)
- [x] ESLint 설정 추가(`.eslintrc.cjs`) — 플러그인만 있고 설정이 없어 `npm run lint`가 항상 실패하던 상태 해소. 현재 오류·경고 0
- [x] 훅 규칙 위반 3건 수정(IntradayChart·TradingFlowChart) — 조기 반환 뒤 useMemo 호출로 데이터 도착 시 훅 개수가 바뀌어 크래시할 수 있었음
- [x] 분봉 X축 틱 간격 0 방어 — 막대 6개 이하 세션에서 무한 루프
- [x] 테스트 환경 API baseURL 주입 — MSW 핸들러(:8000)와 상대경로 baseURL 불일치로 23건이 네트워크 오류로 실패하던 문제
- [x] 미사용 코드 제거 — `utils/returns.js`, `InfoTooltip`, `ChartSkeleton`, `repository.{get_intraday,list_stocks_summary}`, `jobs.is_running`, `scanner._supply_targets`
- [x] 없는 기능 검증 테스트 정리 — 뉴스 관련도(%)·ETF 수수료(expense_ratio) 케이스 삭제, 종목정보·티커검증의 죽은 단언(0.45%·테마 필수) 제거. 백엔드가 채우지 않거나 제거된 기능 대상
- [x] 프론트 테스트 전체 현행화 — 낡은 단언(영문 네비→한글, 카드→트리맵, SVG 화살표→▲▼, 그리드→flex-wrap, expense_ratio 등)과 목 계약(/settings/stocks·api-keys·batch-summary, 시세 DESC) 갱신. 27건 실패 → 0 (328 passed)

### 수익률 기준일을 네이버증권에 맞춤 (2026-08-09)
- [x] 네이버 ETF분석 W1/M1/YTD를 역산해 정의 확인 — 주간=7일 전, 월간=전월 같은 날, YTD=전년도 마지막 거래일(달력 날짜 기준). 기존 5·20거래일·올해 첫 거래일 기준과 달라 KODEX 200선물인버스2X는 주간이 부호까지 반대였다(-32.87% vs +17.07%)
- [x] `services/metrics.py`를 날짜 기준 공용 함수로 재작성(`weekly_return`/`monthly_return`/`ytd_return`/`ytd_base`) — 발굴·대시보드·인사이트가 모두 사용. 휴장이면 이전 거래일로 폴백, 기준일까지 시세가 없으면 값을 만들지 않음
- [x] 연중 상장 종목은 전년 시세가 없어 상장 후 첫 거래일로 폴백하고 화면에 기준일 표기(`ScreeningTable.isLateYtdBase` 판정을 '올해 날짜면 표기'로 반전)
- [x] 옛 기준으로 저장된 YTD 기준가 캐시 무효화(`scanner._ytd_base_is_current`)
- [x] 장중 기준일 어긋남 해소 — 네이버 일별시세는 장중에도 오늘 행을 현재가로 주는데 매매동향은 마감 후 확정이라, 한 행에서 시세만 당일이 됐다. 마감 전에는 당일 행을 버리고(`scanner.confirmed_prices`) 수급도 같은 거래일로 맞춘 뒤 `stock_catalog.metrics_date`에 기준 거래일 기록
- [x] 종목목록수집(marketValue)도 동일 처리 — 장중이면 시세 스냅샷·`updated_at`을 쓰지 않고 직전 확정값 유지(`catalog._upsert_row(price_confirmed=False)`). 7/29 장중 수집분이 11일간 남아 등락률이 +29.87%(확정 +0.49%)로 표시되던 문제
- [x] 장 시간 판정을 `app/timeutil.py`로 일원화(`is_market_hours`/`is_close_confirmed`) — scheduler·scanner·catalog 세 곳에 흩어져 있었음
- [x] 거래량 소유권 정리 — 네이버 두 API가 같은 날 다른 거래량을 준다(000660 8/07: 일별시세 8,605,755 / marketValue 4,796,937). 딥수집 대상은 일별시세가, 나머지는 marketValue가 소유
- [x] freshness 가드에 가려 신규 종목 지표가 영영 비던 버그 — `check_freshness`가 미수집 수(`missing`)를 함께 보고하고, fresh여도 미수집이 있으면 그 종목만 보강 수집(`collect_catalog_data(only_missing=True)`). 전체 재수집 21분 → 23종목 수초
- [x] 검증: 네이버 원본과 전수 대조 — 기본조건 ETF 100건, KOSPI 100건, KOSDAQ 100건 × 8항목 = 2,400개 값 불일치 0건
- [x] `test_compare_endpoint_shape` 시한폭탄 수정 — 기본 조회 구간(최근 30일) 밖으로 시드가 밀려 2026-08-02부터 실패하던 것을 오늘 기준 시드로 교체

### dmg 빌드 스크립트 일원화 (2026-08-09)
- [x] 루트 `build-dmg.sh` 추가 — 의존성 → 테스트 → 아이콘·프론트 빌드 → dmg → 체크섬 검증. `--arch/--clean/--skip-tests/--skip-install` 지원, 서명 인증서 없으면 시작 시 경고
- [x] `desktop/scripts/build.sh`를 위임 shim으로 축소(구현 두 벌 방지), `just dmg` 레시피 추가
- [x] README·CLAUDE.md·desktop-release.md 현행화(수익률 기준일·발굴 수집 범위·빌드 명령·테스트 건수)
