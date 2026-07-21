import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const stockApi = {
  list: () => api.get('/stocks'),
  detail: (ticker) => api.get(`/stocks/${ticker}`),
  prices: (ticker, days = 60) => api.get(`/stocks/${ticker}/prices`, { params: { days } }),
  tradingFlow: (ticker, days = 20) =>
    api.get(`/stocks/${ticker}/trading-flow`, { params: { days } }),
  intraday: (ticker) => api.get(`/stocks/${ticker}/intraday`),
}

export const dataApi = {
  collectAll: () => api.post('/data/collect-all'),
  collectOne: (ticker) => api.post(`/data/collect/${ticker}`),
  syncStocks: () => api.post('/data/sync-stocks'),
  stats: () => api.get('/data/stats'),
}

export default api
