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
    showVolume: true,
    showTradingFlow: true,
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

  it('showVolume이 false일 때 가격 차트를 표시하지 않는다', () => {
    render(<ETFCharts {...defaultProps} showVolume={false} />)

    expect(screen.queryByTestId('price-chart')).not.toBeInTheDocument()
  })

  it('showTradingFlow가 false일 때 매매 동향 차트를 표시하지 않는다', () => {
    render(<ETFCharts {...defaultProps} showTradingFlow={false} />)

    expect(screen.queryByTestId('trading-flow-chart')).not.toBeInTheDocument()
  })
})

