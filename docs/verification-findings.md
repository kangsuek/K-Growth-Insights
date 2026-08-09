# 전체 기능 검증 결과 및 수정 과제

검증일: 2026-07-26 / 방법: 브라우저 실조작 + API 직접 호출 + DB 읽기 대조 + 정적 분석

> **수정 완료 (2026-07-26).** 아래 1~4장의 결함을 모두 수정했다. 항목별 조치 내용과
> 검증 방법은 [9. 수정 이력](#9-수정-이력)에 정리했다. 5장(규칙 충돌)만 판단이 필요해 남겨 두었다.

착수 기준선: 백엔드 pytest **138 passed**, 프론트 vitest **328 passed**(정리 후 326).
검증 중 실제 DB를 파괴적으로 조작했고(카탈로그 삭제·DB 초기화), 사전 백업본으로 **원상 복구 완료**
(종목 15 / 시세 5,178 / 매매동향 3,138 / 분봉 4,924 / 뉴스 171 / 카탈로그 4,292).

---

## 1. 치명 — 데이터 정확성

### 1-1. 매매동향 차트 Y축이 실제의 1/100로 표시된다

`frontend/src/components/charts/TradingFlowChart.jsx:165-176`

`formatYAxis`는 **이미 천 단위로 변환된 값**을 받는다. 그런데 "만" 단위로 바꿀 때 `1000`으로 나눈다.
1만 = 10천이므로 **10으로 나눠야** 한다.

```js
// 현재 (틀림)
if (absValue >= 1000) {
  const tenThousands = absValue / 1000      // ← 백만 단위가 됨
  return `${...}만`
}
```

실측: 삼성전자 2026-07-24 개인 순매수 **6,675,340주**. 축 최상단 눈금 `7.3만`이 실제로는
7,300천 = **7,300,000주(730만주)** 다. 화면이 100배 작게 보인다.

**수정**: `const tenThousands = absValue / 10`

### 1-2. 같은 함수에서 음수 부호가 사라진다

`frontend/src/components/charts/TradingFlowChart.jsx:171-172`

"만" 분기만 `value`가 아닌 `absValue`를 쓰고 부호를 다시 붙이지 않는다. "천" 분기(175행)는
`value`를 그대로 써서 부호가 살아 있다. 실제 화면 축에 `7.3만`이 위·아래로 **두 번** 나타난다
(±7.3만인데 음수 쪽 부호 소실).

**수정**: `value`를 기준으로 부호를 유지하거나 `(value < 0 ? '-' : '')`를 접두.

### 1-3. "주간 수익률"이 화면마다 기준일이 다르다

| 위치 | 기준 인덱스 | 삼성전자 예시 |
|------|------------|--------------|
| `backend/app/routers/etfs.py:163` (대시보드 batch-summary) | `prices_desc[5]` = **6거래일 전** | PLUS 태양광&ESS **+18.17%** |
| `backend/app/services/scanner.py:95` (종목 발굴) | 인덱스 4 = **5거래일 전** | 같은 종목 **+19.58%** |
| `backend/app/services/insights.py:38` (인사이트 1w) | 인덱스 4 | 발굴과 동일 |

실측(457990): 37,530 / 31,760 − 1 = 18.17%(인덱스 5), 37,530 / 31,385 − 1 = 19.58%(인덱스 4).
3곳 중 2곳이 인덱스 4를 쓰므로 **`batch_summary`만 어긋난다**.

**수정**: `routers/etfs.py:163`을 인덱스 4 기준으로 통일하고, 세 곳이 공용 함수를 쓰도록 정리.

### 1-4. 섹터 자동분류가 부분 문자열로 오분류된다

`backend/app/services/catalog.py:34-73` (`_SECTOR_KEYWORDS`, `match_sector`)

`kw.upper() in name_upper` 부분 일치라 단어 경계를 무시한다. 실측 오분류:

| 종목명 | 현재 섹터 | 원인 | 올바른 섹터 |
|--------|-----------|------|-------------|
| 메리츠 KIS CD금리투자 ETN 외 **76건** | 부동산 | 메**리츠** ⊃ `리츠` | 채권·원자재 등 |
| 메리츠화재 | 부동산 | 동일 | 금융 |
| 메리츠제1·2호스팩 | 부동산 | 동일 | — |
| TIGER 리츠부동산인프라 | 건설/인프라 | `인프라`가 먼저 매칭 | 부동산 |
| DAISHIN343 오피스리츠플러스 | AI/로봇 | D**AI**SHIN ⊃ `AI` | 부동산 |

**부동산 섹터 106건 중 76건(72%)이 오분류**다. 실제 리츠는 다른 섹터로 새어 나간다.
테마 탐색의 섹터 평균 수익률·상위 종목이 전부 이 영향을 받는다.

**수정**: 짧은/포함되기 쉬운 키워드(`리츠`, `AI`, `금리`, `EV` 등)는 단어 경계 검사를 적용
(공백·괄호·문자열 경계로 구분). 최소한 `리츠`는 `메리츠` 제외 규칙이 필요하다.

---

## 2. 높음 — 동작·부하

### 2-1. 대시보드를 열어두면 갱신 주기마다 전체 수집이 돈다

`frontend/src/pages/Dashboard.jsx:130-136` → `handleRefreshAll` → `dataApi.collectAll(1)`

자동 새로고침이 켜져 있으면(기본 ON, 기본 30초) **주기마다 15종목 전체 수집**이 실행된다.
종목당 시세·매매동향·분봉·펀더멘털·(ETF면 구성종목)·뉴스 ≈ 6요청 → **30초마다 약 90회** 네이버 호출.

실측 증거(백엔드 로그): 대시보드를 연 것만으로 `POST /api/data/collect-all?days=1`이 자동 실행되고,
이어서 네이버 뉴스 검색 API가 **`429 Too Many Requests`** 로 연속 실패했다.

같은 화면(설정)에서 이 작업을 "소요 시간: 약 9분"이라고 안내하면서 30초마다 자동 실행하는 것은 모순이다.

**수정 방향**: 자동 갱신은 **조회만**(쿼리 재요청) 하고, 수집은 수동 버튼/스케줄러에 맡긴다.
자동 수집을 유지한다면 최소 주기를 크게 늘리고 뉴스 수집은 분리한다.

### 2-2. 카탈로그 삭제가 확인 없이 즉시 실행된다

`frontend/src/components/settings/DataManagementPanel.jsx:492-498`

```jsx
onClick={() => clearTickerCatalogMutation.mutate()}
```

확인 모달이 없다. 실측: 한 번 클릭으로 **4,292건 → 0건**. 같은 화면의 "데이터베이스 초기화"는
확인 모달(`isResetModalOpen`)을 거치므로 일관성도 깨진다.

**수정**: 초기화와 동일한 확인 모달 적용.

### 2-3. DATABASE_PATH 상대 경로 때문에 DB가 두 개로 갈라졌다

`.env:2` → `DATABASE_PATH=backend/data/kgrowth.db` (상대 경로)

백엔드는 `cd backend && uv run uvicorn ...`(justfile)로 뜨므로 cwd가 `backend/`다.
따라서 실제 경로는 **`backend/backend/data/kgrowth.db`** 로 해석된다.

```
backend/data/kgrowth.db            479KB  2026-07-21  ← 의도한 경로, 방치됨
backend/backend/data/kgrowth.db    5.1MB  현재 사용 중  ← 실제 데이터
```

파생 문제: 패키징된 데스크톱 앱에 **사용자 실데이터 DB가 그대로 번들**됐다.
`desktop/electron-builder.yml:24-25`의 제외 규칙이 `!*.db`, `!data/*.db`뿐이라
중첩 경로 `backend/data/kgrowth.db`를 걸러내지 못한다.

```
desktop/release/mac-arm64/K-Growth Insights.app/Contents/Resources/backend/backend/data/kgrowth.db  5.1MB
desktop/release/mac/K-Growth Insights.app/Contents/Resources/backend/backend/data/kgrowth.db        5.1MB
```

**수정**: `DATABASE_PATH`를 절대 경로로 잡거나 `config.py`에서 `BASE_DIR` 기준으로 해석한다.
빌더 필터에 `"!**/*.db"`를 추가한다. 중첩 디렉터리 정리 후 재수집으로 통합한다.

### 2-4. 종목 관리가 네이티브 `alert()`를 쓴다

`frontend/src/components/settings/TickerManagementPanel.jsx:43,46,59,62,81,89,114`
`frontend/src/components/settings/TickerForm.jsx:174,177,183`
`frontend/src/components/settings/GeneralSettingsPanel.jsx:58` (`window.confirm`)

프로젝트에 Toast 시스템(`contexts/ToastContext.jsx`, `components/common/Toast.jsx`)이 있고
`DataManagementPanel`·`Screening`·`Dashboard`는 이미 Toast를 쓴다. 종목 관리만 네이티브 대화상자다.
UX가 불일치하고, 브라우저 자동화·E2E 테스트가 이 지점에서 멈춘다(이번 검증에서 종목 삭제 버튼을
클릭하지 못한 이유).

**수정**: Toast/커스텀 모달로 통일.

---

## 3. 중간 — 표시 오류

### 3-1. 다크모드 변형 누락 7곳

`frontend/src/components/settings/GeneralSettingsPanel.jsx` — `89, 124, 131, 143, 152, 208, 230`행

`text-gray-700` / `bg-gray-100` / `bg-gray-200`에 `dark:` 변형이 없다. 다크 테마에서
**"새로고침 간격" 라벨과 "현재 설정: ..." 문구가 거의 보이지 않고**, 간격 버튼만 흰색으로 떠 보인다.
같은 파일 263행은 `dark:text-gray-300`을 제대로 붙여 두었으므로 누락이 명확하다.
(전체 스캔 결과 이 문제는 이 파일에만 있다.)

### 3-2. 자동 갱신 주기 단위가 대시보드에서만 "초"로 고정

`frontend/src/pages/Dashboard.jsx:416` — `자동 갱신 ({settings.autoRefresh.interval / 1000}초)`

설정 화면이 "10분"이면 대시보드는 **"600초"** 로 표시한다. 실측: 설정 "1분" → 대시보드 "60초".

**수정**: 설정 화면의 `getIntervalLabel`을 재사용.

### 3-3. 초기화 안내와 실제 삭제 대상이 다르다

- `frontend/src/components/settings/DataManagementPanel.jsx:242` — `data.deleted.collection_status`를 읽는데
  **`collection_status` 테이블은 스키마에 없다**(`backend/app/database.py`). 항상 "수집 상태: 0건".
- `backend/app/services/repository.py:394-405` `reset_collected_data()`는 실제로
  `prices, trading_flow, intraday_prices, news, stock_fundamentals, etf_fundamentals, etf_holdings`를 지운다.
  화면 안내에는 **펀더멘털·ETF 구성종목이 빠져 있다**.

**수정**: 존재하지 않는 `collection_status` 제거, 안내 문구에 펀더멘털·구성종목 추가.

### 3-4. 데이터 통계에 분봉이 없다

`/api/data/stats`는 `intraday_prices`를 반환하는데(실측 4,924건) 통계 카드에는 없다
(`DataManagementPanel.jsx:392-420` 부근). 초기화 안내와 삭제 결과 토스트(243행)에는 분봉이 나온다.

### 3-5. 초기화 후에도 DB 크기가 그대로다

전체 삭제 직후에도 "데이터베이스 크기 4.92 MB"가 유지된다(SQLite는 VACUUM 전까지 파일이 안 줄어듦).
사용자에겐 삭제가 안 된 것처럼 보인다. **수정**: 초기화 시 `VACUUM` 실행 또는 문구 보완.

### 3-6. "외국인 순매수 상위" 카드가 순매수량 대신 주간 수익률을 보여준다

대시보드 추천 카드에서 삼성전자가 `▲+2.25%`로 표시되는데, 이는 주간 수익률이고 외국인 순매수량
(1,299,490주)이 아니다. 바로 위 히트맵의 삼성전자는 일간 −7.6%라 값이 충돌하는 것처럼 보인다.
(데이터는 정확하나 지표 선택이 카드 제목과 어긋난다.)

---

## 4. 낮음 — 죽은 코드 (2026-07-26 커밋 `5071065` 이후 추가 발견분)

| 대상 | 근거 |
|------|------|
| `POST /api/data/sync-catalog` (`backend/app/routers/data.py:26-33`) | 프론트 `api.js`·`justfile` 어디서도 호출하지 않음. `backend/tests/test_catalog.py`만 참조 |
| `catalog.sync_catalog()` (`backend/app/services/catalog.py:134-146`) | 위 라우트 전용. 실사용 경로는 `sync_catalog_detailed()` |
| `POST /api/data/collect/{ticker}` (`backend/app/routers/data.py:36-40`) | 프론트·justfile 미사용. `README.md:66`, `docs/plan.md:147`에만 언급 |

`POST /api/data/sync-stocks`는 `justfile:27`(`just collect`)이 호출하므로 **유지 대상**이다.

CLAUDE.md의 "백엔드는 실제 사용하는 엔드포인트만 유지한다" 규칙에 따라 위 3건은 제거 대상이다.
제거 시 `test_catalog.py`의 해당 테스트와 README·plan 문서도 함께 정리해야 한다.

---

## 5. 규칙 충돌 (판단 필요)

`frontend/src/utils/format.js:18-27` `formatVolume`은 거래량을 `7.9M` / `1.2K`로 축약한다.
CLAUDE.md의 "사용자에게 보여지는 모든 숫자는 천 단위 구분 기호(`toLocaleString('ko-KR')`)" 규칙과
어긋나지만, `format.test.js:50-52`가 `'1.0M'`을 기대하도록 **의도적으로 고정**돼 있다.
규칙을 고칠지 구현을 고칠지 결정이 필요하다. (한국어 화면이라면 `790만` 형태가 자연스럽다.)

---

## 6. 정상 확인된 항목

값이 API·DB와 정확히 일치함을 확인했다.

- **설정 데이터 통계**: 종목 15 / 카탈로그 4,292 / 가격 5,178 / 매매동향 3,138 / 뉴스 171 / 4.92MB / 마지막 수집 07-25 13:53 — 전부 일치
- **대시보드 카드(SK하이닉스)**: 1,759,000 · −8.34% · 시가 1,900,000 · 고가 1,909,000 · 저가 1,752,000 ·
  주간 −4.51% · 개인 143만(1,431,548) · 기관 −48만(−483,881) · 외국인 −98만(−976,779) · 뉴스 5건 — 전부 일치
- **시장 현황**: 코스피 6,690.62 (−406.27, −5.72%), 코스닥 748.22 (−42.06, −5.32%) — API와 일치
- **상세 피봇 계산**(전일 고 273,000 / 저 263,000 / 종가 270,000 기준): PP 268,666.67 · R1 274,333.33 ·
  R2 278,666.67 · S1 264,333.33 · S2 258,666.67 · S3 254,333.33 — **전부 수식과 일치**
- **RSI 41.5 → "하락 추세"** 판정(30~50 구간) 정확
- **한화솔루션 +0.0%**: 실제 등락률 0.0(시가=종가 30,000) — 오류 아님
- **종목 발굴**: ETF 총 1,150건, 정렬·필터·페이지네이션 정상
- **테마 탐색**: 23개 섹터, 평균 주간수익률 내림차순, 값 없는 "인버스"는 맨 뒤 — 설계대로
- **종목 순서 변경**: 위/아래 버튼 → DB `sort_order` 즉시 반영 확인
- **테마 전환 / 새로고침 간격 / 기본 날짜 범위 / 표시 옵션 토글**: 모두 정상 반영
- **카탈로그 삭제·DB 초기화**: 실제로 동작(4,292→0, 시세·뉴스·매매동향 0, 종목 15 유지)
- **비교 API**: 삼성전자 vs SK하이닉스 30일 — 공통 22거래일, 상관계수 0.91, 통계 산출 정상
- **일시투자 시뮬레이션**: 100만원/340,500 → 2주 + 잔액 319,000 → 평가 818,000, −18.2%.
  검산 `2 × 249,500 + 319,000 = 818,000` 일치

---

## 7. 이번 검증에서 다루지 못한 범위

| 항목 | 사유 |
|------|------|
| 종목 삭제 버튼 실클릭 | 성공 시 `alert()`가 브라우저 세션을 정지시켜 보류 (2-4 수정 후 재검증) |
| 비교 결과 화면, 시뮬레이션·포트폴리오 UI | `sr-only` 체크박스에 합성 클릭이 전달되지 않아 UI 조작 실패. **기능 자체는 API로 검증 완료** |
| 새 종목 추가·수정 폼 | 저장 시 `alert()` 발생 (2-4와 동일 사유) |
| 종목 목록 수집 / 전체 데이터 수집 버튼 | 네이버 대량 호출 + 수 분 소요라 미실행 |

---

## 8. 수정 우선순위 제안

1. **1-1, 1-2** 매매동향 축 (표시값이 100배 틀리고 부호가 사라짐 — 투자 판단에 직결)
2. **1-3** 주간 수익률 기준 통일
3. **2-1** 자동 갱신의 전체 수집 분리 (네이버 API 429 유발)
4. **1-4** 섹터 분류 단어 경계
5. **2-3** DATABASE_PATH + 빌드 산출물에서 사용자 DB 제외
6. **2-2** 카탈로그 삭제 확인 절차
7. **2-4** alert → Toast 통일 (이후 E2E 검증 가능해짐)
8. **3-x** 표시 오류들
9. **4** 죽은 코드 제거

---

## 9. 수정 이력

2026-07-26 적용. 검증: 백엔드 pytest **138 passed**, 프론트 vitest **326 passed / 3 skipped**,
eslint 무경고, 프로덕션 빌드 성공.

백엔드 테스트 수는 착수 시점과 같은 138이다. 회귀 테스트 3건(섹터 오분류 2건, 주간 수익률 기준 1건)을
추가했고, 죽은 코드 제거로 그 코드만 검증하던 테스트 3건을 정리했다.

### 1장 — 치명

| 항목 | 조치 | 검증 |
|------|------|------|
| 1-1 Y축 1/100 표시 | `TradingFlowChart.jsx` `formatYAxis`의 만 단위 환산을 `/1000` → `/10`으로 수정 | **브라우저 확인**: 삼성전자 축 눈금 `7.3만` → `734.3만` (개인 순매수 6,675,340주와 자릿수 일치) |
| 1-2 음수 부호 소실 | 같은 함수에 `sign` 변수를 두고 만 분기에도 부호를 붙임 | **브라우저 확인**: 축이 `-734.3만  -334.3만  657천  734.3만` (이전 `7.3만 3.3만 657천 7.3만`) |
| 1-3 주간 수익률 기준 불일치 | `app/services/metrics.py` 신설(`WEEKLY_LOOKBACK = 4`). `routers/etfs.py`·`scanner.py`·`insights.py`가 모두 이 함수를 호출 | API 대조: 457990 기준 대시보드·발굴 모두 **19.5794%** 로 일치. `test_migration_phase1.py` 기대값을 인덱스 4로 갱신, `test_insights.py`에 공용 기준 고정 테스트 추가 |
| 1-4 섹터 부분일치 오분류 | `catalog.py`에 `_contains_keyword` 도입. 라틴 키워드(AI/IT/EV/SOX/REIT)는 영문 단어 경계 검사, 한글은 충돌 조합만 제외(`리츠` ← `메리츠`). `부동산`을 `건설/인프라` 앞으로 이동, `금융`에 `화재` 추가 | `test_catalog.py`에 회귀 테스트 2건 추가. 메리츠 ETN → 채권/원자재, 메리츠화재 → 금융, `TIGER 리츠부동산인프라`·`DAISHIN343 오피스리츠플러스` → 부동산, `TIGER 미국AI데이터센터` → AI/로봇 |

한글 키워드에 단어 경계를 그대로 적용하면 `SK리츠`·`미국AI데이터센터` 같은 정상 합성어까지
막힌다. 처음 시도한 접두 검사 방식이 이 회귀를 냈고, 위 방식으로 교체해 해결했다.

### 2장 — 높음

| 항목 | 조치 | 검증 |
|------|------|------|
| 2-1 자동 갱신이 전체 수집 유발 | `Dashboard.jsx`에 `handleRefetchOnly` 추가. 자동 갱신 타이머는 이제 쿼리 재요청만 하고 `collectAll`을 호출하지 않는다. 수동 새로고침 버튼은 기존대로 수집 수행 | 대시보드 로드 후 백엔드 로그에 `POST /api/data/collect-all` 자동 호출 없음 |
| 2-2 카탈로그 삭제에 확인 없음 | 확인 모달(`isClearCatalogModalOpen`) 추가. 삭제 건수와 재수집 필요성을 안내 | 코드 검토 + 빌드. 버튼이 즉시 삭제 대신 모달을 연다 |
| 2-3 DATABASE_PATH 상대 경로 | `config.py`에 `_resolve_path()` 추가 — 상대 경로를 프로젝트 루트 기준으로 고정 해석(`DATABASE_PATH`·`STOCKS_CONFIG_PATH`). 실데이터를 `backend/data/kgrowth.db`로 이전하고 중첩 `backend/backend/` 제거. `electron-builder.yml` 제외 규칙을 `!**/*.db`(+ wal/shm)로 확대 | 앱이 보는 경로가 `<루트>/backend/data/kgrowth.db`로 확인. 이전 후 종목 15·시세 5,178·카탈로그 4,292 그대로 |
| 2-4 네이티브 alert/confirm | `TickerManagementPanel`·`TickerForm`의 `alert()` 10곳을 Toast로, `GeneralSettingsPanel`의 `window.confirm`을 확인 모달로 교체 | 전체 스캔 결과 `alert(`·`window.confirm` 잔존 0건 |

### 3장 — 중간

| 항목 | 조치 | 검증 |
|------|------|------|
| 3-1 다크모드 변형 누락 | `GeneralSettingsPanel.jsx` 7곳에 `dark:` 변형 추가(라벨·현재설정 문구·간격 버튼·초기화 버튼·토글 트랙 3개) | 재스캔 결과 `dark:` 없는 `text-gray-700/800/900`·`bg-gray-100/200` 잔존 0건 |
| 3-2 주기 단위 표기 불일치 | `utils/format.js`에 `formatRefreshInterval()` 추가. 대시보드·설정이 같은 함수 사용 | 600초 → "10분"으로 표기 통일 (코드 검토) |
| 3-3 초기화 안내 불일치 | 존재하지 않는 `collection_status` 제거, 실제 삭제 대상(펀더멘털·ETF 구성종목) 추가 — 토스트·설명문·모달 목록 3곳 | **브라우저 확인**: "가격, 뉴스, 매매 동향, 분봉, 펀더멘털, ETF 구성종목" |
| 3-4 통계에 분봉 누락 | `DataManagementPanel`에 '분봉 레코드' 카드 추가 | **브라우저 확인**: 분봉 레코드 4,924 표시 |
| 3-5 초기화 후 DB 크기 유지 | `reset_collected_data()`가 삭제 후 별도 연결로 `VACUUM` 실행 | pytest 통과(기존 초기화 테스트 유지) |
| 3-6 추천 카드 지표 불일치 | `RecommendationCards.jsx`에 `getPresetMetric()` 추가 — 프리셋별로 외국인/기관 순매수량, 거래량, 주간수익률을 각각 표시 | 코드 검토 + 빌드 |

### 4장 — 죽은 코드 제거

- `POST /api/data/sync-catalog` 라우트와 `catalog.sync_catalog()` 서비스 제거
- `POST /api/data/collect/{ticker}` 라우트 제거
- `routers/data.py`의 미사용 임포트 정리(`catalog`, `collectors`, `naver_client`, `HTTPException`, `CollectResult`)
- `test_catalog.py`의 관련 테스트 3건 정리 — 워치리스트 분리 검증은 실사용 경로(`sync_catalog_detailed`) 기준으로 이관

`POST /api/data/sync-stocks`는 `justfile`의 `just collect`가 호출하므로 유지했다.

### 남은 항목

- **5장 규칙 충돌**(`formatVolume`의 `7.9M` 표기): CLAUDE.md의 천단위 규칙과 어긋나지만
  테스트가 의도적으로 고정하고 있어 **미결**. 규칙을 고칠지 구현을 고칠지 결정 필요.
- **7장 미검증 범위**: 종목 삭제·추가·수정 폼은 alert 제거로 이제 브라우저 자동화가
  가능해졌으나 이번 회차에서는 재검증하지 못했다.
- `메리츠 솔랙티브 금 선물 ETN(H)`은 키워드 목록에 `금선물`만 있고 `금 선물`(띄어쓰기)이
  없어 미분류로 남는다. 부분일치 버그와는 별개인 키워드 커버리지 문제다.
