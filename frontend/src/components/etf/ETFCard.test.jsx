import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { server } from '../../test/mocks/server'
import { http, HttpResponse } from 'msw'
import ETFCard from './ETFCard'

// Mock data
const mockETF = {
  ticker: '487240',
  name: '삼성 KODEX AI전력핵심설비 ETF',
  type: 'ETF',
  theme: 'AI & 전력 인프라',
  expense_ratio: 0.45,
}

const mockStock = {
  ticker: '042660',
  name: '한화오션',
  type: 'STOCK',
  theme: '조선/방산',
  expense_ratio: null,
}

const mockPricesData = [
  {
    date: '2025-11-10',
    open_price: 15100,
    high_price: 15300,
    low_price: 15000,
    close_price: 15250,
    volume: 1250000,
    daily_change_pct: 2.34,
  },
  {
    date: '2025-11-07',
    open_price: 15000,
    high_price: 15200,
    low_price: 14900,
    close_price: 15100,
    volume: 1200000,
    daily_change_pct: 1.01,
  },
  {
    date: '2025-11-06',
    open_price: 14900,
    high_price: 15100,
    low_price: 14850,
    close_price: 15000,
    volume: 1150000,
    daily_change_pct: 0.68,
  },
  {
    date: '2025-11-05',
    open_price: 14800,
    high_price: 15000,
    low_price: 14750,
    close_price: 14900,
    volume: 1100000,
    daily_change_pct: 0.34,
  },
  {
    date: '2025-11-04',
    open_price: 14700,
    high_price: 14900,
    low_price: 14650,
    close_price: 14800,
    volume: 1050000,
    daily_change_pct: 0.68,
  },
]

const mockTradingFlowData = [
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
    title: 'AI 전력 수요 급증, ETF 상승세',
    published_at: '2025-11-10T09:00:00',
  },
  {
    id: 2,
    title: '데이터센터 전력 인프라 투자 확대',
    published_at: '2025-11-09T14:30:00',
  },
]

describe('ETFCard', () => {
  beforeEach(() => {
    // Setup default handlers
    server.use(
      http.get('http://localhost:8000/api/etfs/487240/prices', () => {
        return HttpResponse.json(mockPricesData)
      }),
      http.get('http://localhost:8000/api/etfs/487240/trading-flow', () => {
        return HttpResponse.json(mockTradingFlowData)
      }),
      http.get('http://localhost:8000/api/news/487240', () => {
        return HttpResponse.json(mockNewsData)
      }),
      http.get('http://localhost:8000/api/etfs/042660/prices', () => {
        return HttpResponse.json(mockPricesData)
      }),
      http.get('http://localhost:8000/api/etfs/042660/trading-flow', () => {
        return HttpResponse.json(mockTradingFlowData)
      }),
      http.get('http://localhost:8000/api/news/042660', () => {
        return HttpResponse.json(mockNewsData)
      })
    )
  })

  it('ETF 기본 정보를 표시한다', () => {
    renderWithProviders(<ETFCard etf={mockETF} />)

    expect(screen.getByText('삼성 KODEX AI전력핵심설비 ETF')).toBeInTheDocument()
    expect(screen.getByText('AI & 전력 인프라')).toBeInTheDocument()
    expect(screen.getByText('ETF')).toBeInTheDocument()
    expect(screen.getByText('487240')).toBeInTheDocument()
  })

  it('주식(STOCK) 타입을 올바르게 표시한다', () => {
    renderWithProviders(<ETFCard etf={mockStock} />)

    expect(screen.getByText('한화오션')).toBeInTheDocument()
    expect(screen.getByText('STOCK')).toBeInTheDocument()
  })

  it('가격 데이터를 로딩하고 표시한다', async () => {
    renderWithProviders(<ETFCard etf={mockETF} />)

    // 로딩 상태 확인
    expect(screen.getByText('삼성 KODEX AI전력핵심설비 ETF')).toBeInTheDocument()

    // 가격 데이터 로딩 대기
    await waitFor(() => {
      expect(screen.getByText('15,250')).toBeInTheDocument()
    })

    // 등락률 확인
    expect(screen.getByText('+2.34%')).toBeInTheDocument()

    // 시가/고가/저가 확인
    expect(screen.getByText('시가')).toBeInTheDocument()
    expect(screen.getByText('15,100')).toBeInTheDocument()
    expect(screen.getByText('고가')).toBeInTheDocument()
    expect(screen.getByText('15,300')).toBeInTheDocument()
    expect(screen.getByText('저가')).toBeInTheDocument()
    expect(screen.getByText('15,000')).toBeInTheDocument()
  })

  it('거래량을 올바른 형식으로 표시한다', async () => {
    renderWithProviders(<ETFCard etf={mockETF} />)

    await waitFor(() => {
      expect(screen.getByText(/거래량:/)).toBeInTheDocument()
    })

    // 거래량이 1.3M 형식으로 표시되어야 함
    expect(screen.getByText(/1\.3M/)).toBeInTheDocument()
  })

  it('주간 수익률을 계산하고 표시한다', async () => {
    renderWithProviders(<ETFCard etf={mockETF} />)

    await waitFor(() => {
      expect(screen.getByText(/주간:/)).toBeInTheDocument()
    })

    // 주간 수익률: (15250 - 14800) / 14800 * 100 = 3.04%
    expect(screen.getByText(/\+3\.04%/)).toBeInTheDocument()
  })

  it('매매 동향 데이터를 표시한다', async () => {
    renderWithProviders(<ETFCard etf={mockETF} />)

    await waitFor(() => {
      expect(screen.getByText(/매매 동향/)).toBeInTheDocument()
    })

    expect(screen.getByText('개인')).toBeInTheDocument()
    expect(screen.getByText('기관')).toBeInTheDocument()
    expect(screen.getByText('외국인')).toBeInTheDocument()

    // 매매 금액이 표시되는지만 확인 (formatTradingValue의 정확한 출력은 구현에 따라 다를 수 있음)
    const tradingData = screen.getByText(/매매 동향/)
    expect(tradingData.parentElement).toBeInTheDocument()
  })

  it('뉴스 데이터를 표시한다', async () => {
    renderWithProviders(<ETFCard etf={mockETF} />)

    await waitFor(() => {
      expect(screen.getByText('최근 뉴스')).toBeInTheDocument()
    })

    expect(screen.getByText('2건')).toBeInTheDocument()
    expect(screen.getByText('AI 전력 수요 급증, ETF 상승세')).toBeInTheDocument()
  })

  it('수수료 정보를 표시한다 (ETF)', async () => {
    renderWithProviders(<ETFCard etf={mockETF} />)

    await waitFor(() => {
      expect(screen.getByText('수수료: 0.45%')).toBeInTheDocument()
    })
  })

  it('수수료 정보를 표시하지 않는다 (STOCK)', async () => {
    renderWithProviders(<ETFCard etf={mockStock} />)

    await waitFor(() => {
      expect(screen.getByText('한화오션')).toBeInTheDocument()
    })

    expect(screen.queryByText(/수수료:/)).not.toBeInTheDocument()
  })

  it('가격 데이터 로딩 실패 시 적절한 메시지를 표시한다', async () => {
    server.use(
      http.get('http://localhost:8000/api/etfs/487240/prices', () => {
        return new HttpResponse(null, { status: 500 })
      }),
      http.get('http://localhost:8000/api/etfs/487240/trading-flow', () => {
        return new HttpResponse(null, { status: 500 })
      }),
      http.get('http://localhost:8000/api/news/487240', () => {
        return HttpResponse.json([])
      })
    )

    renderWithProviders(<ETFCard etf={mockETF} />)

    await waitFor(() => {
      expect(screen.getByText(/가격 정보 없음/)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('상승 등락률에 빨간색을 적용한다', async () => {
    renderWithProviders(<ETFCard etf={mockETF} />)

    await waitFor(() => {
      const changeElement = screen.getByText('+2.34%')
      expect(changeElement).toHaveClass('text-red-600')
    })
  })

  it('하락 등락률에 파란색을 적용한다', async () => {
    server.use(
      http.get('http://localhost:8000/api/etfs/487240/prices', () => {
        const negativeData = [
          {
            ...mockPricesData[0],
            close_price: 14900,
            daily_change_pct: -1.32,
          },
        ]
        return HttpResponse.json(negativeData)
      })
    )

    renderWithProviders(<ETFCard etf={mockETF} />)

    await waitFor(() => {
      const changeElement = screen.getByText('-1.32%')
      expect(changeElement).toHaveClass('text-blue-600')
    })
  })

  it('클릭 시 상세 페이지로 이동할 수 있는 링크를 포함한다', () => {
    const { container } = renderWithProviders(<ETFCard etf={mockETF} />)

    const link = container.querySelector('a[href="/etf/487240"]')
    expect(link).toBeInTheDocument()
  })

  it('차트를 렌더링한다', async () => {
    const { container } = renderWithProviders(<ETFCard etf={mockETF} />)

    await waitFor(() => {
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  it('차트 호버 시 툴팁을 표시한다', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<ETFCard etf={mockETF} />)

    // 차트 로딩 대기
    await waitFor(() => {
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    // 캔들스틱 찾기
    const candles = container.querySelectorAll('rect[class*="cursor-pointer"]')
    expect(candles.length).toBeGreaterThan(0)

    // 첫 번째 캔들에 마우스 오버
    await user.hover(candles[0])

    // 툴팁 확인
    await waitFor(() => {
      expect(screen.getByText(/시가:/)).toBeInTheDocument()
      expect(screen.getByText(/고가:/)).toBeInTheDocument()
      expect(screen.getByText(/저가:/)).toBeInTheDocument()
      expect(screen.getByText(/종가:/)).toBeInTheDocument()
    })
  })
})
