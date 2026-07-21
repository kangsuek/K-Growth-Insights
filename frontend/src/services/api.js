import axios from 'axios'
import {
  DEFAULT_API_TIMEOUT,
  FAST_API_TIMEOUT,
  NORMAL_API_TIMEOUT,
  LONG_API_TIMEOUT,
  ERROR_MESSAGES,
} from '../constants'

// 프록시를 사용하도록 상대 경로로 설정
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// API Key (환경 변수에서 로드)
const API_KEY = import.meta.env.VITE_API_KEY

// 기본 Axios 인스턴스 생성 (기본 타임아웃 사용)
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 백엔드 연결 확인 (배포 시 VITE_API_BASE_URL 기준으로 요청, 상대 경로로 /api/health 도달)
export const getHealthCheck = () =>
  api.get('health', { timeout: FAST_API_TIMEOUT })

// 요청 인터셉터
api.interceptors.request.use(
  (config) => {
    // API Key가 설정된 경우 모든 요청에 추가
    if (API_KEY) {
      config.headers['X-API-Key'] = API_KEY
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 응답 인터셉터
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 에러 응답 처리
    if (error.response) {
      // 서버 응답이 있는 경우
      const { status, data } = error.response

      switch (status) {
        case 400:
          error.message = data.detail || ERROR_MESSAGES.BAD_REQUEST
          break
        case 401:
          error.message = data.detail || '인증이 필요합니다. API 키를 확인해주세요.'
          break
        case 404:
          error.message = data.detail || ERROR_MESSAGES.NOT_FOUND
          break
        case 500:
          error.message = data.detail || ERROR_MESSAGES.SERVER_ERROR
          break
        default:
          error.message = data.detail || ERROR_MESSAGES.SERVER_ERROR
      }
    } else if (error.request) {
      // 요청은 보냈으나 응답이 없는 경우
      console.error('[API] 서버 응답 없음:', error.request)
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        error.message = ERROR_MESSAGES.TIMEOUT_ERROR
      } else {
        error.message = ERROR_MESSAGES.NETWORK_ERROR
      }
    } else {
      // 요청 설정 중 오류 발생
      console.error('[API] 요청 설정 에러:', error)
      error.message = error.message || ERROR_MESSAGES.SERVER_ERROR
    }

    return Promise.reject(error)
  }
)

// ETF API 서비스
export const etfApi = {
  // 전체 종목 조회 (빠른 조회)
  getAll: () => api.get('/etfs/', { timeout: FAST_API_TIMEOUT }),

  // 개별 종목 정보 (빠른 조회)
  getDetail: (ticker) => api.get(`/etfs/${ticker}`, { timeout: FAST_API_TIMEOUT }),

  // 가격 데이터 조회 (일반 조회)
  getPrices: (ticker, params = {}) => {
    const { startDate, endDate, days } = params
    return api.get(`/etfs/${ticker}/prices`, {
      timeout: NORMAL_API_TIMEOUT,
      params: {
        start_date: startDate,
        end_date: endDate,
        days
      }
    })
  },

  // 매매 동향 조회 (일반 조회)
  getTradingFlow: (ticker, params = {}) => {
    const { startDate, endDate, days } = params
    return api.get(`/etfs/${ticker}/trading-flow`, {
      timeout: NORMAL_API_TIMEOUT,
      params: {
        start_date: startDate,
        end_date: endDate,
        days
      }
    })
  },

  // 종목 지표 조회 (일반 조회)
  getMetrics: (ticker) => api.get(`/etfs/${ticker}/metrics`, { timeout: NORMAL_API_TIMEOUT }),

  // 펀더멘털 조회 (ETF: NAV 추이 + 구성종목, STOCK: 재무 지표) (일반 조회)
  getFundamentals: (ticker) => api.get(`/etfs/${ticker}/fundamentals`, { timeout: NORMAL_API_TIMEOUT }),

  // 종목 인사이트 조회 (일반 조회)
  getInsights: (ticker, period = '1m') =>
    api.get(`/etfs/${ticker}/insights`, {
      timeout: NORMAL_API_TIMEOUT,
      params: { period }
    }),

  // 종목 비교 (일반 조회)
  compare: (params = {}) => {
    return api.get('/etfs/compare', {
      timeout: NORMAL_API_TIMEOUT,
      params
    })
  },

  // 배치 요약 조회 (일반 조회) - N+1 쿼리 최적화
  getBatchSummary: (tickers, priceDays = 10, newsLimit = 5) => {
    return api.post('/etfs/batch-summary', {
      tickers,
      price_days: priceDays,
      news_limit: newsLimit
    }, {
      timeout: NORMAL_API_TIMEOUT
    })
  },

  // 분봉(시간별 체결) 데이터 조회 (자동 수집 시 오래 걸릴 수 있음)
  getIntraday: (ticker, params = {}) => {
    const { targetDate, autoCollect = true, forceRefresh = false } = params
    return api.get(`/etfs/${ticker}/intraday`, {
      timeout: LONG_API_TIMEOUT,
      params: {
        target_date: targetDate,
        auto_collect: autoCollect,
        force_refresh: forceRefresh
      }
    })
  },

  // AI 분석 프롬프트 생성 (API 호출 없이 프롬프트만 반환)
  getAIPrompt: (ticker) =>
    api.get(`/etfs/${ticker}/ai-prompt`, { timeout: FAST_API_TIMEOUT }),

  // 복수 종목 통합 비교 분석 프롬프트 생성
  getAIPromptMulti: (stocks) =>
    api.post('/etfs/ai-prompt-multi', { stocks }, { timeout: FAST_API_TIMEOUT }),
}

// News API 서비스
export const newsApi = {
  // 종목별 뉴스 조회 (분석 결과 포함)
  getByTicker: (ticker, params = {}) => {
    const { startDate, endDate, days, limit, analyze = true } = params
    return api.get(`/news/${ticker}`, {
      timeout: NORMAL_API_TIMEOUT,
      params: {
        start_date: startDate,
        end_date: endDate,
        days,
        limit,
        analyze
      }
    })
  },

  // 뉴스 수집 트리거 (긴 작업)
  collect: (ticker, days = 7) =>
    api.post(`/news/${ticker}/collect`, null, { 
      timeout: LONG_API_TIMEOUT,
      params: { days } 
    }),
}

// Data Collection API 서비스
export const dataApi = {
  // 전체 종목 데이터 수집 (긴 작업)
  collectAll: (days = 10) =>
    api.post('/data/collect-all', null, { 
      timeout: LONG_API_TIMEOUT,
      params: { days } 
    }),

  // 스케줄러 상태 조회 (빠른 조회)
  getSchedulerStatus: () => api.get('/data/scheduler-status', { timeout: FAST_API_TIMEOUT }),

  // 데이터베이스 통계 조회 (일반 조회)
  getStats: () => api.get('/data/stats', { timeout: NORMAL_API_TIMEOUT }),

  // 데이터베이스 초기화 (위험!) (긴 작업)
  reset: () => api.delete('/data/reset', { timeout: LONG_API_TIMEOUT }),

  // 전체 데이터 수집 진행률 조회 (빠른 조회)
  getCollectProgress: () => api.get('/data/collect-progress', { timeout: FAST_API_TIMEOUT }),
}

// Health Check API
export const healthApi = {
  check: () => api.get('/health', { timeout: FAST_API_TIMEOUT }),
}

// Settings API 서비스
export const settingsApi = {
  // 종목 목록 조회 (stocks.json 기반) (빠른 조회)
  getStocks: () => api.get('/settings/stocks', { timeout: FAST_API_TIMEOUT }),

  // 종목 추가 (일반 작업)
  createStock: (data) => api.post('/settings/stocks', data, { timeout: NORMAL_API_TIMEOUT }),

  // 종목 수정 (일반 작업)
  updateStock: (ticker, data) => api.put(`/settings/stocks/${ticker}`, data, { timeout: NORMAL_API_TIMEOUT }),

  // 종목 삭제 (일반 작업)
  deleteStock: (ticker) => api.delete(`/settings/stocks/${ticker}`, { timeout: NORMAL_API_TIMEOUT }),

  // 종목 유효성 검증 (네이버 금융 스크래핑) (일반 조회)
  validateTicker: (ticker) => api.get(`/settings/stocks/${ticker}/validate`, { timeout: NORMAL_API_TIMEOUT }),

  // 종목 검색 (자동완성용) (빠른 조회)
  searchStocks: (query, type = null) => {
    const params = { q: query }
    if (type) params.type = type
    return api.get('/settings/stocks/search', { params, timeout: FAST_API_TIMEOUT })
  },

  // 종목 목록 수집 트리거 (긴 작업)
  collectTickerCatalog: () => api.post('/settings/ticker-catalog/collect', null, { timeout: LONG_API_TIMEOUT }),

  // 종목 목록 수집 진행률 조회 (빠른 조회)
  getTickerCatalogProgress: () => api.get('/settings/ticker-catalog/collect-progress', { timeout: FAST_API_TIMEOUT }),

  // 종목 순서 변경 (일반 작업)
  reorderStocks: (tickers) => api.post('/settings/stocks/reorder', tickers, { timeout: NORMAL_API_TIMEOUT }),

  // API 키 조회 (마스킹된 값)
  getApiKeys: (raw = false) => api.get('/settings/api-keys', { params: { raw }, timeout: FAST_API_TIMEOUT }),

  // API 키 저장
  updateApiKeys: (data) => api.put('/settings/api-keys', data, { timeout: NORMAL_API_TIMEOUT }),
}

// Alert (목표가/알림) API 서비스
export const alertApi = {
  // 종목별 알림 규칙 조회
  getRules: (ticker, activeOnly = true) =>
    api.get(`/alerts/${ticker}`, { params: { active_only: activeOnly }, timeout: FAST_API_TIMEOUT }),

  // 알림 규칙 생성
  createRule: (data) => api.post('/alerts/', data, { timeout: NORMAL_API_TIMEOUT }),

  // 알림 규칙 수정
  updateRule: (ruleId, data) => api.put(`/alerts/${ruleId}`, data, { timeout: NORMAL_API_TIMEOUT }),

  // 알림 규칙 삭제
  deleteRule: (ruleId) => api.delete(`/alerts/${ruleId}`, { timeout: NORMAL_API_TIMEOUT }),

  // 알림 트리거 기록 (프론트에서 감지 후 백엔드에 기록)
  recordTrigger: (data) => api.post('/alerts/trigger', data, { timeout: FAST_API_TIMEOUT }),
}

// Simulation API 서비스
export const simulationApi = {
  // 일시 투자 시뮬레이션 (긴 작업 - 자동 수집 가능)
  lumpSum: (data) => api.post('/simulation/lump-sum', data, { timeout: LONG_API_TIMEOUT }),

  // 적립식 투자 시뮬레이션 (긴 작업)
  dca: (data) => api.post('/simulation/dca', data, { timeout: LONG_API_TIMEOUT }),

  // 포트폴리오 시뮬레이션 (긴 작업)
  portfolio: (data) => api.post('/simulation/portfolio', data, { timeout: LONG_API_TIMEOUT }),
}

// Scanner API 서비스 (조건 검색, 테마 탐색, 추천)
export const scannerApi = {
  // 조건 검색 (일반 조회)
  search: (params = {}) => api.get('/scanner', { params, timeout: NORMAL_API_TIMEOUT }),

  // 테마 탐색 (일반 조회)
  getThemes: () => api.get('/scanner/themes', { timeout: NORMAL_API_TIMEOUT }),

  // 추천 프리셋 (일반 조회)
  getRecommendations: (limit = 5) =>
    api.get('/scanner/recommendations', { params: { limit }, timeout: NORMAL_API_TIMEOUT }),

  // 데이터 수집 트리거 (긴 작업). force=false면 최신일 때 {status:'fresh'} 반환.
  collectData: (force = false) =>
    api.post('/scanner/collect-data', null, { params: { force }, timeout: FAST_API_TIMEOUT }),

  // 데이터 수집 진행률 조회 (빠른 조회)
  getCollectProgress: () => api.get('/scanner/collect-progress', { timeout: FAST_API_TIMEOUT }),

  // 데이터 수집 중지
  cancelCollect: () => api.post('/scanner/cancel-collect', null, { timeout: FAST_API_TIMEOUT }),
}

// Market Overview API 서비스
export const marketApi = {
  // KOSPI/KOSDAQ 지수 현황 조회
  getOverview: () => api.get('/market/overview', { timeout: 8000 }),
  // 지수 일별 차트 데이터 조회
  getIndexChart: (code, period = '3M') => api.get(`/market/index/${code}/chart`, { params: { period }, timeout: 10000 }),
}

// 단순화된 API 인터페이스
export const apiService = {
  getETFs: async () => {
    const response = await etfApi.getAll()
    return response.data
  },
  compareETFs: async (params) => {
    const response = await etfApi.compare(params)
    return response.data
  },
}

// 통합 API 객체 (편의를 위해 export)
export { api }

export default apiService
