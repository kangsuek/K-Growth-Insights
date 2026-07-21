import axios from 'axios'

// 모든 요청은 Vite 개발 프록시(/api -> :8000 FastAPI)를 통해 전달된다.
const api = axios.create({ baseURL: '/api' })

// 종목 및 시장 데이터 조회 엔드포인트
export const stockApi = {
  // 종목 목록 + 각 종목의 최신 종가·등락률을 한 번에 조회.
  // 대시보드가 종목마다 개별 요청(N+1)하지 않도록 하는 배치 엔드포인트.
  summary: () => api.get('/stocks/summary'),
  detail: (ticker) => api.get(`/stocks/${ticker}`),
  prices: (ticker, days = 60) => api.get(`/stocks/${ticker}/prices`, { params: { days } }),
  tradingFlow: (ticker, days = 20) =>
    api.get(`/stocks/${ticker}/trading-flow`, { params: { days } }),
  intraday: (ticker) => api.get(`/stocks/${ticker}/intraday`),
  // 주식/ETF 펀더멘털 (type에 따라 stock 또는 etf+holdings 응답).
  fundamentals: (ticker) => api.get(`/stocks/${ticker}/fundamentals`),
}

// 네이버 모바일 API에서 최신 데이터를 SQLite로 수집하는 엔드포인트
export const dataApi = {
  collectAll: () => api.post('/data/collect-all'),
  collectOne: (ticker) => api.post(`/data/collect/${ticker}`),
  stats: () => api.get('/data/stats'),
}

export default api
