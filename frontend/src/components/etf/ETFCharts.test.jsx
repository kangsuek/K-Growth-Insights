import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ETFCharts from './ETFCharts'

// Mock dependencies
vi.mock('../charts/PriceChart', () => ({
  default: ({ ticker, data }) => <div data-testid="price-chart">{ticker}: {data?.length || 0} items</div>
}))

vi.mock('../charts/TradingFlowChart', () => ({
  default: ({ ticker, data }) => <div data-testid="trading-flow-chart">{ticker}: {data?.length || 0} items</div>
}))

vi.mock('../common/LoadingIndicator', () => ({
  default: ({ message }) => <div data-testid="loading-indicator">{message}</div>
}))

vi.mock('../common/ErrorFallback', () => ({
  default: ({ error, onRetry }) => (
    <div data-testid="error-fallback">
      {error?.message}
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  )
}))

describe('ETFCharts', () => {
  const defaultProps = {
    ticker: '069660',
    dateRange: '7d',
    pricesLoading: false,
    pricesFetching: false,
    tradingFlowLoading: false,
    tradingFlowFetching: false,
    pricesError: null,
    tradingFlowError: null,
    refetchPrices: vi.fn(),
    refetchTradingFlow: vi.fn(),
    priceChartScrollRef: { current: null },
    tradingFlowChartScrollRef: { current: null },
    onPriceChartScroll: vi.fn(),
    onTradingFlowChartScroll: vi.fn(),
  }

  it('가격 차트를 표시한다', () => {
    const pricesData = [
      { date: '2024-01-01', close_price: 1000, volume: 1000000 },
    ]

    render(<ETFCharts {...defaultProps} pricesData={pricesData} />)

    expect(screen.getByTestId('price-chart')).toBeInTheDocument()
    expect(screen.getByText('069660: 1 items')).toBeInTheDocument()
  })

  it('매매 동향 차트를 표시한다', () => {
    const tradingFlowData = [
      { date: '2024-01-01', individual_net: 1000, institutional_net: 2000, foreign_net: 3000 },
    ]

    render(<ETFCharts {...defaultProps} tradingFlowData={tradingFlowData} />)

    expect(screen.getByTestId('trading-flow-chart')).toBeInTheDocument()
    expect(screen.getByText('069660: 1 items')).toBeInTheDocument()
  })

  it('로딩 상태일 때 로딩 인디케이터를 표시한다', () => {
    render(<ETFCharts {...defaultProps} pricesLoading={true} />)

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
    expect(screen.getByText('가격 데이터를 불러오는 중...')).toBeInTheDocument()
  })

  it('에러 상태일 때 에러 폴백을 표시한다', () => {
    const error = { message: '데이터를 불러올 수 없습니다' }

    render(<ETFCharts {...defaultProps} pricesError={error} />)

    expect(screen.getByTestId('error-fallback')).toBeInTheDocument()
    expect(screen.getByText('데이터를 불러올 수 없습니다')).toBeInTheDocument()
  })

  // 회귀 방지: 예전에는 '거래량 표시'·'매매 동향 표시' 설정으로 두 카드를 숨길 수
  // 있었고, 거래량 토글 하나가 가격 차트 카드 전체를 없애기도 했다. 설정을 제거한
  // 뒤로는 두 차트가 항상 함께 보여야 한다.
  it('가격 차트와 매매 동향 차트를 항상 함께 표시한다', () => {
    const pricesData = [
      { date: '2024-01-01', close_price: 1000, volume: 1000000 },
    ]
    const tradingFlowData = [
      { date: '2024-01-01', individual_net: 1000, institutional_net: 2000, foreign_net: 3000 },
    ]

    render(
      <ETFCharts {...defaultProps} pricesData={pricesData} tradingFlowData={tradingFlowData} />
    )

    expect(screen.getByTestId('price-chart')).toBeInTheDocument()
    expect(screen.getByTestId('trading-flow-chart')).toBeInTheDocument()
  })
})

