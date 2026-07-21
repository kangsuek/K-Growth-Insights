/**
 * Application-wide constants
 * 
 * 애플리케이션 전반에서 사용되는 상수들을 정의합니다.
 * 하드코딩된 값을 상수로 관리하여 유지보수성을 향상시킵니다.
 */

// =============================================================================
// API 타임아웃 관련 상수
// =============================================================================

/**
 * 기본 API 타임아웃 (밀리초)
 * 
 * 용도:
 * - 모든 API 요청의 기본 타임아웃
 * - 자동 수집 등 긴 작업을 지원하기 위해 60초로 설정
 * 
 * 왜 60000ms (60초)인가?
 * - 자동 수집 API는 여러 종목을 순차적으로 수집하므로 시간이 오래 걸림
 * - 일반 조회 API도 충분한 시간 확보
 * - 너무 짧으면 타임아웃 에러 발생
 * - 너무 길면 사용자 경험 저하
 */
export const DEFAULT_API_TIMEOUT = 120000 // 120초

/**
 * 빠른 조회 API 타임아웃 (밀리초)
 * 
 * 용도:
 * - 단순 조회 API (GET 요청)
 * - 빠른 응답이 예상되는 엔드포인트
 * 
 * 예시:
 * - /api/etfs/ (전체 종목 조회)
 * - /api/etfs/{ticker} (개별 종목 정보)
 * - /api/health (헬스 체크)
 */
export const FAST_API_TIMEOUT = 30000 // 30초

/**
 * 일반 조회 API 타임아웃 (밀리초)
 * 
 * 용도:
 * - 데이터 조회 API (가격, 매매동향 등)
 * - 중간 정도의 응답 시간이 예상되는 엔드포인트
 * 
 * 예시:
 * - /api/etfs/{ticker}/prices
 * - /api/etfs/{ticker}/trading-flow
 * - /api/etfs/{ticker}/metrics
 */
export const NORMAL_API_TIMEOUT = 60000 // 60초

/**
 * 긴 작업 API 타임아웃 (밀리초)
 * 
 * 용도:
 * - 데이터 수집 트리거 API
 * - 여러 종목을 처리하는 작업
 * - 종목 목록 수집 (5-10분 소요)
 * 
 * 예시:
 * - /api/data/collect-all
 * - /api/data/backfill
 * - /api/etfs/{ticker}/collect
 * - /api/settings/ticker-catalog/collect (5-10분 소요)
 */
export const LONG_API_TIMEOUT = 1800000 // 1800초 (30분) - 대량 데이터 수집을 위해 충분한 시간 확보

// =============================================================================
// 색상 코드 상수
// =============================================================================

/**
 * 가격 변동 색상
 * 
 * 용도:
 * - 상승/하락 표시
 * - 수익률 표시
 */
export const COLORS = {
  // 가격 변동
  PRICE_UP: '#dc2626',      // 빨강 (상승)
  PRICE_DOWN: '#2563eb',    // 파랑 (하락)
  PRICE_NEUTRAL: '#6b7280', // 회색 (변동 없음)

  // 순매수/순매도
  NET_BUYING: '#dc2626',    // 빨강 (순매수)
  NET_SELLING: '#2563eb',   // 파랑 (순매도)

  // 차트 색상
  CHART_PRIMARY: '#2563eb',   // 파랑 (기본)
  CHART_SECONDARY: '#10b981', // 초록
  CHART_TERTIARY: '#f59e0b',  // 주황
  CHART_DANGER: '#ef4444',    // 빨강
  CHART_PURPLE: '#8b5cf6',    // 보라
  CHART_PINK: '#ec4899',      // 분홍

  // 이동평균선 색상
  MA_5: '#8b5cf6',   // 보라 (5일 이동평균)
  MA_10: '#10b981',  // 초록 (10일 이동평균)
  MA_20: '#ef4444',  // 빨강 (20일 이동평균)

  // 차트 그리드/축 (CSS 변수로 다크모드 자동 대응)
  CHART_GRID: 'var(--chart-grid, #e5e7eb)',    // 라이트: gray-200, 다크: gray-700
  CHART_AXIS: 'var(--chart-axis, #6b7280)',    // 라이트: gray-500, 다크: gray-400
  CHART_CURSOR: '#6b7280',  // 회색 (커서)

  // 거래량 색상
  VOLUME_UP: '#ef4444',     // 빨강 (상승 거래량)
  VOLUME_DOWN: '#3b82f6',   // 파랑 (하락 거래량)

  // RSI 차트
  RSI_LINE: '#8b5cf6',       // 보라 (RSI 라인)
  RSI_OVERBOUGHT: '#fee2e2', // 연한 빨강 (과매수 영역)
  RSI_OVERSOLD: '#dbeafe',   // 연한 파랑 (과매도 영역)

  // MACD 차트
  MACD_LINE: '#2563eb',      // 파랑 (MACD 라인)
  MACD_SIGNAL: '#f59e0b',    // 주황 (Signal 라인)
  MACD_HIST_POS: '#ef4444',  // 빨강 (히스토그램 양수)
  MACD_HIST_NEG: '#3b82f6',  // 파랑 (히스토그램 음수)
}

/**
 * 차트 색상 팔레트
 * 
 * 용도:
 * - 여러 종목을 비교할 때 사용
 * - NormalizedPriceChart 등에서 사용
 */
export const CHART_COLOR_PALETTE = [
  COLORS.CHART_PRIMARY,   // blue
  COLORS.CHART_SECONDARY, // green
  COLORS.CHART_TERTIARY,  // amber
  COLORS.CHART_DANGER,    // red
  COLORS.CHART_PURPLE,    // violet
  COLORS.CHART_PINK,      // pink
]

// =============================================================================
// 에러 메시지 상수
// =============================================================================

/**
 * API 에러 메시지
 * 
 * 백엔드에서 반환하는 에러 메시지와 매핑하여 사용자 친화적인 메시지로 변환
 */
export const ERROR_MESSAGES = {
  // 네트워크 에러
  NETWORK_ERROR: '서버와 연결할 수 없습니다. 네트워크 연결을 확인해주세요.',
  TIMEOUT_ERROR: '요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',

  // 서버 에러 (400번대)
  BAD_REQUEST: '잘못된 요청입니다.',
  VALIDATION_ERROR: '입력값이 올바르지 않습니다.',
  NOT_FOUND: '요청한 리소스를 찾을 수 없습니다.',

  // 서버 에러 (500번대)
  SERVER_ERROR: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  DATABASE_ERROR: '데이터베이스 오류가 발생했습니다.',
  SCRAPER_ERROR: '데이터 소스에 일시적으로 접근할 수 없습니다.',

  // 데이터 수집 관련
  COLLECTION_FAILED: '데이터 수집에 실패했습니다. 잠시 후 다시 시도해주세요.',
  BACKFILL_FAILED: '백필에 실패했습니다. 잠시 후 다시 시도해주세요.',

  // 날짜 범위 관련
  DATE_RANGE_INVALID: '날짜 범위가 올바르지 않습니다.',
  DATE_RANGE_TOO_LONG: '최대 조회 기간은 1년(365일)입니다.',
  DATE_START_AFTER_END: '시작 날짜는 종료 날짜보다 이전이어야 합니다.',
  DATE_FUTURE_NOT_ALLOWED: '미래 날짜는 선택할 수 없습니다.',
}

// =============================================================================
// 날짜 검증 관련 상수
// =============================================================================

/**
 * 최대 조회 기간 (일)
 * 
 * 백엔드와 동일한 값 사용
 */
export const MAX_DATE_RANGE_DAYS = 365

/**
 * 검색 최소 길이 (글자)
 *
 * 용도:
 * - 종목 검색 시 최소 입력 길이
 * - 2글자 미만은 검색하지 않음
 */
export const MIN_SEARCH_LENGTH = 2

/**
 * 기본 조회 기간 (일)
 */
export const DEFAULT_DATE_RANGE_DAYS = 7

/**
 * 비교 페이지 최대 종목 선택 수
 * - Comparison.jsx, TickerSelector.jsx에서 공통 사용 (한 곳만 수정하면 반영)
 */
export const COMPARE_MAX_TICKERS = 20

// =============================================================================
// 차트 관련 상수
// =============================================================================

/**
 * 차트 최대 표시 포인트 수
 * 
 * 용도:
 * - 대용량 데이터 샘플링 시 최대 포인트 수
 * - 차트 성능 최적화를 위해 200개로 제한
 * 
 * 왜 200개인가?
 * - 차트 렌더링 성능과 가독성의 균형
 * - 너무 많으면 렌더링 지연, 너무 적으면 정보 손실
 * - 일반적인 차트 라이브러리 권장값 (100-300개)
 */
export const MAX_CHART_POINTS = 200

// =============================================================================
// 캐시 TTL (Time To Live) 상수 - 백엔드와 일치
// =============================================================================

/**
 * TanStack Query staleTime 설정
 *
 * staleTime: 데이터가 fresh → stale로 전환되는 시간
 * gcTime (이전 cacheTime): 메모리에서 캐시가 제거되는 시간
 *
 * 원칙:
 * - 백엔드 캐시 TTL과 일치시켜 불필요한 요청 방지
 * - staleTime < gcTime (메모리에 더 오래 유지)
 */

/**
 * 정적 데이터 캐시 TTL (5분 = 300초)
 *
 * 적용 대상:
 * - /api/etfs/ (전체 종목 목록)
 * - /api/etfs/{ticker} (종목 상세)
 *
 * 백엔드 CACHE_TTL_STATIC과 일치
 */
export const CACHE_STALE_TIME_STATIC = 5 * 60 * 1000 // 5분

/**
 * 빠르게 변하는 데이터 캐시 TTL (30초)
 *
 * 적용 대상:
 * - /api/etfs/{ticker}/prices (가격 데이터)
 * - /api/etfs/{ticker}/trading-flow (매매동향)
 * - /api/etfs/batch-summary (배치 요약)
 *
 * 백엔드 CACHE_TTL_FAST_CHANGING과 일치
 */
export const CACHE_STALE_TIME_FAST = 30 * 1000 // 30초

/**
 * 천천히 변하는 데이터 캐시 TTL (1분 = 60초)
 *
 * 적용 대상:
 * - /api/news/{ticker} (뉴스)
 * - /api/etfs/{ticker}/metrics (지표)
 * - /api/etfs/compare (종목 비교)
 *
 * 백엔드 CACHE_TTL_SLOW_CHANGING과 일치
 */
export const CACHE_STALE_TIME_SLOW = 60 * 1000 // 1분

/**
 * 상태 정보 캐시 TTL (10초)
 *
 * 적용 대상:
 * - /api/data/status (수집 상태)
 * - /api/data/scheduler-status (스케줄러 상태)
 *
 * 백엔드 CACHE_TTL_STATUS와 일치
 */
export const CACHE_STALE_TIME_STATUS = 10 * 1000 // 10초

/**
 * 통계 정보 캐시 TTL (1분 = 60초)
 *
 * 적용 대상:
 * - /api/data/stats (전체 통계)
 *
 * 백엔드 CACHE_TTL_STATS와 일치
 */
export const CACHE_STALE_TIME_STATS = 60 * 1000 // 1분

/**
 * 가비지 컬렉션 시간 (메모리 유지 시간)
 *
 * 용도:
 * - stale 상태의 캐시를 메모리에서 제거하는 시간
 * - 페이지 전환 시에도 캐시를 유지하기 위해 staleTime보다 길게 설정
 */
export const CACHE_GC_TIME = 10 * 60 * 1000 // 10분

