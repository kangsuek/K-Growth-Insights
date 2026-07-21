import { http, HttpResponse } from 'msw'

const BASE_URL = 'http://localhost:8000/api'

// Mock data - 6개 종목
const mockETFData = [
  {
    ticker: '487240',
    name: '삼성 KODEX AI전력핵심설비 ETF',
    type: 'ETF',
    theme: 'AI & 전력 인프라',
    expense_ratio: 0.45,
    listing_date: '2024-03-15',
  },
  {
    ticker: '466920',
    name: '신한 SOL 조선TOP3플러스 ETF',
    type: 'ETF',
    theme: '조선/해운',
    expense_ratio: 0.40,
    listing_date: '2023-08-20',
  },
  {
    ticker: '0020H0',
    name: '미래에셋 TIGER AI반도체핵심장비Solactive',
    type: 'ETF',
    theme: 'AI 반도체',
    expense_ratio: 0.50,
    listing_date: '2024-01-10',
  },
  {
    ticker: '442320',
    name: '미래에셋 TIGER 2차전지소재Fn',
    type: 'ETF',
    theme: '2차 전지',
    expense_ratio: 0.45,
    listing_date: '2022-12-05',
  },
  {
    ticker: '042660',
    name: '한화오션',
    type: 'STOCK',
    theme: '조선/방산',
    expense_ratio: null,
    listing_date: '1978-06-29',
  },
  {
    ticker: '034020',
    name: '두산에너빌리티',
    type: 'STOCK',
    theme: '발전/에너지',
    expense_ratio: null,
    listing_date: '2021-10-06',
  },
]

const mockPricesData = [
  {
    date: '2025-11-04',
    open_price: 14700,
    high_price: 14900,
    low_price: 14650,
    close_price: 14800,
    volume: 1050000,
    daily_change_pct: 0.68,
  },
  {
    date: '2025-11-05',
    open_price: 14800,
    high_price: 15000,
    low_price: 14750,
    close_price: 14900,
    volume: 1100000,
    daily_change_pct: 0.68,
  },
  {
    date: '2025-11-06',
    open_price: 14900,
    high_price: 15100,
    low_price: 14850,
    close_price: 15000,
    volume: 1150000,
    daily_change_pct: 0.67,
  },
  {
    date: '2025-11-07',
    open_price: 15000,
    high_price: 15200,
    low_price: 14900,
    close_price: 15100,
    volume: 1200000,
    daily_change_pct: 0.67,
  },
  {
    date: '2025-11-10',
    open_price: 15100,
    high_price: 15300,
    low_price: 15000,
    close_price: 15250,
    volume: 1250000,
    daily_change_pct: 0.99,
  },
]

const mockTradingFlowData = [
  {
    date: '2025-11-04',
    individual_net: -5000000,
    institutional_net: 3000000,
    foreign_net: 2000000,
  },
  {
    date: '2025-11-05',
    individual_net: 10000000,
    institutional_net: -4000000,
    foreign_net: -6000000,
  },
  {
    date: '2025-11-06',
    individual_net: 8000000,
    institutional_net: -3000000,
    foreign_net: -5000000,
  },
  {
    date: '2025-11-07',
    individual_net: 12000000,
    institutional_net: -6000000,
    foreign_net: -6000000,
  },
  {
    date: '2025-11-10',
    individual_net: 15000000,
    institutional_net: -8000000,
    foreign_net: -7000000,
  },
]

const mockNewsData = [
  {
    id: 1,
    ticker: '487240',
    title: 'AI 전력 수요 급증, ETF 상승세',
    url: 'https://example.com/news/1',
    source: 'Naver News',
    date: '2025-11-10T09:00:00',
    published_at: '2025-11-10T09:00:00',
    relevance_score: 0.92,
  },
  {
    id: 2,
    ticker: '487240',
    title: '데이터센터 전력 인프라 투자 확대',
    url: 'https://example.com/news/2',
    source: 'Naver News',
    date: '2025-11-09T14:30:00',
    published_at: '2025-11-09T14:30:00',
    relevance_score: 0.85,
  },
  {
    id: 3,
    ticker: '042660',
    title: '한화오션, 대형 선박 수주',
    url: 'https://example.com/news/3',
    source: 'Naver News',
    date: '2025-11-10T10:00:00',
    published_at: '2025-11-10T10:00:00',
    relevance_score: 0.95,
  },
]

export const handlers = [
  // GET /api/etfs/ - 모든 ETF 목록 (슬래시 포함)
  http.get(`${BASE_URL}/etfs/`, () => {
    return HttpResponse.json(mockETFData)
  }),

  // GET /api/etfs - 모든 ETF 목록 (슬래시 없음)
  http.get(`${BASE_URL}/etfs`, () => {
    return HttpResponse.json(mockETFData)
  }),

  // GET /api/etfs/:ticker - 특정 ETF 상세
  http.get(`${BASE_URL}/etfs/:ticker`, ({ params }) => {
    const { ticker } = params
    const etf = mockETFData.find(e => e.ticker === ticker)
    if (etf) {
      return HttpResponse.json(etf)
    }
    return new HttpResponse(null, { status: 404 })
  }),

  // GET /api/etfs/:ticker/prices - 가격 데이터
  http.get(`${BASE_URL}/etfs/:ticker/prices`, ({ params }) => {
    const { ticker } = params
    // 특정 종목에 대한 가격 데이터 반환
    return HttpResponse.json(mockPricesData)
  }),

  // GET /api/etfs/:ticker/trading-flow - 매매 동향
  http.get(`${BASE_URL}/etfs/:ticker/trading-flow`, ({ params }) => {
    const { ticker } = params
    // 특정 종목에 대한 매매 동향 데이터 반환
    return HttpResponse.json(mockTradingFlowData)
  }),

  // GET /api/news/:ticker - 뉴스 (ticker 포함)
  http.get(`${BASE_URL}/news/:ticker`, ({ params }) => {
    const { ticker } = params
    // 특정 종목에 대한 뉴스 데이터 반환
    const newsForTicker = mockNewsData.filter(news => news.ticker === ticker)
    return HttpResponse.json(newsForTicker.length > 0 ? newsForTicker : mockNewsData.slice(0, 2))
  }),

  // GET /api/news - 전체 뉴스
  http.get(`${BASE_URL}/news`, () => {
    return HttpResponse.json(mockNewsData)
  }),

  // GET /api/data/scheduler-status - 스케줄러 상태
  http.get(`${BASE_URL}/data/scheduler-status`, () => {
    return HttpResponse.json({
      scheduler: {
        last_collection_time: '2025-11-10T09:00:00',
        next_collection_time: '2025-11-10T15:00:00',
      },
    })
  }),

  // GET /api/data/status - 수집 상태
  http.get(`${BASE_URL}/data/status`, () => {
    return HttpResponse.json({
      total_tickers: 6,
      completed: 6,
      failed: 0,
      status: 'completed',
    })
  }),

  // POST /api/etfs/:ticker/collect - 가격 데이터 수집
  http.post(`${BASE_URL}/etfs/:ticker/collect`, () => {
    return HttpResponse.json({
      message: 'Price collection started',
      status: 'success',
    })
  }),

  // POST /api/etfs/:ticker/collect-trading-flow - 매매 동향 수집
  http.post(`${BASE_URL}/etfs/:ticker/collect-trading-flow`, () => {
    return HttpResponse.json({
      message: 'Trading flow collection started',
      status: 'success',
    })
  }),

  // POST /api/news/:ticker/collect - 뉴스 수집
  http.post(`${BASE_URL}/news/:ticker/collect`, () => {
    return HttpResponse.json({
      message: 'News collection started',
      status: 'success',
    })
  }),

  // POST /api/data/collect-all - 전체 데이터 수집
  http.post(`${BASE_URL}/data/collect-all`, () => {
    return HttpResponse.json({
      message: 'All data collection started',
      status: 'success',
    })
  }),

  // GET /api/health - Health check
  http.get(`${BASE_URL}/health`, () => {
    return HttpResponse.json({
      status: 'ok',
      version: '1.0.0',
    })
  }),

  // Settings API Handlers

  // POST /api/settings/stocks - 종목 추가
  http.post(`${BASE_URL}/settings/stocks`, async ({ request }) => {
    const body = await request.json()
    const { ticker } = body

    // 중복 티커 체크
    const exists = mockETFData.find(e => e.ticker === ticker)
    if (exists) {
      return new HttpResponse(
        JSON.stringify({ detail: '이미 존재하는 티커 코드입니다.' }),
        { status: 400 }
      )
    }

    // 새 종목 추가 (실제로는 mockETFData에 추가하지 않음 - 테스트용)
    return HttpResponse.json(body, { status: 201 })
  }),

  // PUT /api/settings/stocks/:ticker - 종목 수정
  http.put(`${BASE_URL}/settings/stocks/:ticker`, async ({ params, request }) => {
    const { ticker } = params
    const body = await request.json()

    const exists = mockETFData.find(e => e.ticker === ticker)
    if (!exists) {
      return new HttpResponse(
        JSON.stringify({ detail: '종목을 찾을 수 없습니다.' }),
        { status: 404 }
      )
    }

    // 수정된 종목 정보 반환
    return HttpResponse.json({ ...exists, ...body })
  }),

  // DELETE /api/settings/stocks/:ticker - 종목 삭제
  http.delete(`${BASE_URL}/settings/stocks/:ticker`, ({ params }) => {
    const { ticker } = params

    const exists = mockETFData.find(e => e.ticker === ticker)
    if (!exists) {
      return new HttpResponse(
        JSON.stringify({ detail: '종목을 찾을 수 없습니다.' }),
        { status: 404 }
      )
    }

    // CASCADE 삭제 통계 반환
    return HttpResponse.json({
      ticker: ticker,
      deleted: {
        prices: 150,
        news: 20,
        trading_flow: 30,
      },
    })
  }),

  // GET /api/settings/stocks/:ticker/validate - 종목 검증 (네이버 스크래핑)
  http.get(`${BASE_URL}/settings/stocks/:ticker/validate`, ({ params }) => {
    const { ticker } = params

    // 존재하지 않는 종목 시뮬레이션
    if (ticker === '999999') {
      return new HttpResponse(
        JSON.stringify({ detail: '종목을 찾을 수 없습니다.' }),
        { status: 404 }
      )
    }

    // 정상적인 종목 정보 반환 (stocks.json 형식)
    return HttpResponse.json({
      ticker: ticker,
      name: ticker === '005930' ? '삼성전자' : 'KODEX 테스트 ETF',
      type: ticker.length === 6 ? 'ETF' : 'STOCK',
      theme: ticker === '005930' ? '반도체/전자' : 'AI/반도체',
      launch_date: ticker.length === 6 ? '2024-01-01' : null,
      expense_ratio: ticker.length === 6 ? '0.45' : null,
      search_keyword: ticker === '005930' ? '삼성전자' : 'KODEX',
      relevance_keywords: ticker === '005930'
        ? ['삼성전자', '반도체', '전자', 'IT']
        : ['ETF', 'AI', '반도체'],
    })
  }),
]
