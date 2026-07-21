import { describe, it, expect } from 'vitest'
import { server } from '../test/mocks/server'
import { http, HttpResponse } from 'msw'
import { etfApi, newsApi, dataApi, healthApi } from './api'

describe('API Services', () => {

  describe('etfApi', () => {
    it('getAll - 전체 종목 목록을 조회한다', async () => {
      const mockData = [
        { ticker: '487240', name: '삼성 KODEX AI전력핵심설비 ETF' },
        { ticker: '466920', name: '신한 SOL 조선TOP3플러스 ETF' },
      ]

      server.use(
        http.get('http://localhost:8000/api/etfs/', () => {
          return HttpResponse.json(mockData)
        })
      )

      const response = await etfApi.getAll()
      expect(response.data).toEqual(mockData)
      expect(response.data).toHaveLength(2)
    })

    it('getDetail - 개별 종목 상세 정보를 조회한다', async () => {
      const mockData = {
        ticker: '487240',
        name: '삼성 KODEX AI전력핵심설비 ETF',
        type: 'ETF',
      }

      server.use(
        http.get('http://localhost:8000/api/etfs/487240', () => {
          return HttpResponse.json(mockData)
        })
      )

      const response = await etfApi.getDetail('487240')
      expect(response.data).toEqual(mockData)
      expect(response.data.ticker).toBe('487240')
    })

    it('getPrices - 가격 데이터를 조회한다', async () => {
      const mockData = [
        {
          date: '2025-11-10',
          close_price: 15250,
          volume: 1250000,
        },
      ]

      server.use(
        http.get('http://localhost:8000/api/etfs/487240/prices', () => {
          return HttpResponse.json(mockData)
        })
      )

      const response = await etfApi.getPrices('487240', { days: 5 })
      expect(response.data).toEqual(mockData)
    })

    it('getTradingFlow - 매매 동향을 조회한다', async () => {
      const mockData = [
        {
          date: '2025-11-10',
          individual_net: 15000000,
          institutional_net: -8000000,
          foreign_net: -7000000,
        },
      ]

      server.use(
        http.get('http://localhost:8000/api/etfs/487240/trading-flow', () => {
          return HttpResponse.json(mockData)
        })
      )

      const response = await etfApi.getTradingFlow('487240', { days: 1 })
      expect(response.data).toEqual(mockData)
    })

    it('getMetrics - 종목 지표를 조회한다', async () => {
      const mockData = {
        ticker: '487240',
        average_volume: 1200000,
        volatility: 1.25,
      }

      server.use(
        http.get('http://localhost:8000/api/etfs/487240/metrics', () => {
          return HttpResponse.json(mockData)
        })
      )

      const response = await etfApi.getMetrics('487240')
      expect(response.data).toEqual(mockData)
    })
  })

  describe('newsApi', () => {
    it('getByTicker - 종목별 뉴스를 조회한다', async () => {
      const mockData = [
        {
          id: 1,
          title: 'AI 전력 수요 급증',
          published_at: '2025-11-10T09:00:00',
        },
        {
          id: 2,
          title: '데이터센터 투자 확대',
          published_at: '2025-11-09T14:30:00',
        },
      ]

      server.use(
        http.get('http://localhost:8000/api/news/487240', () => {
          return HttpResponse.json(mockData)
        })
      )

      const response = await newsApi.getByTicker('487240', { limit: 5 })
      expect(response.data).toEqual(mockData)
      expect(response.data).toHaveLength(2)
    })

    it('collect - 뉴스 수집을 트리거한다', async () => {
      const mockData = { message: 'News collection started', status: 'success' }

      server.use(
        http.post('http://localhost:8000/api/news/487240/collect', () => {
          return HttpResponse.json(mockData)
        })
      )

      const response = await newsApi.collect('487240', 7)
      expect(response.data).toEqual(mockData)
    })
  })

  describe('dataApi', () => {
    it('collectAll - 전체 데이터 수집을 트리거한다', async () => {
      const mockData = { message: 'All data collection started', status: 'success' }

      server.use(
        http.post('http://localhost:8000/api/data/collect-all', () => {
          return HttpResponse.json(mockData)
        })
      )

      const response = await dataApi.collectAll(10)
      expect(response.data).toEqual(mockData)
    })

    it('getSchedulerStatus - 스케줄러 상태를 조회한다', async () => {
      const mockData = {
        scheduler: {
          last_collection_time: '2025-11-10T09:00:00',
          next_collection_time: '2025-11-10T15:00:00',
        },
      }

      server.use(
        http.get('http://localhost:8000/api/data/scheduler-status', () => {
          return HttpResponse.json(mockData)
        })
      )

      const response = await dataApi.getSchedulerStatus()
      expect(response.data).toEqual(mockData)
    })
  })

  describe('healthApi', () => {
    it('check - 헬스 체크를 수행한다', async () => {
      const mockData = { status: 'ok' }

      server.use(
        http.get('http://localhost:8000/api/health', () => {
          return HttpResponse.json(mockData)
        })
      )

      const response = await healthApi.check()
      expect(response.data).toEqual(mockData)
    })
  })

  describe('Error Handling', () => {
    it('404 에러를 올바르게 처리한다', async () => {
      server.use(
        http.get('http://localhost:8000/api/etfs/999999', () => {
          return new HttpResponse(
            JSON.stringify({ detail: 'ETF not found' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          )
        })
      )

      try {
        await etfApi.getDetail('999999')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('ETF not found')
      }
    })

    it('500 에러를 올바르게 처리한다', async () => {
      server.use(
        http.get('http://localhost:8000/api/etfs/', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      try {
        await etfApi.getAll()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toBe('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      }
    })

    it('네트워크 에러를 올바르게 처리한다', async () => {
      server.use(
        http.get('http://localhost:8000/api/etfs/', () => {
          return HttpResponse.error()
        })
      )

      try {
        await etfApi.getAll()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toContain('서버와 연결할 수 없습니다')
      }
    })
  })
})
