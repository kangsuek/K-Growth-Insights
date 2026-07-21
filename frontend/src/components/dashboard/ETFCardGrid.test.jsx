import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ETFCardGrid from './ETFCardGrid'

// Mock ETFCard
vi.mock('../etf/ETFCard', () => ({
  default: ({ etf }) => (
    <div data-testid={`etf-card-${etf.ticker}`}>
      {etf.name}
    </div>
  )
}))

describe('ETFCardGrid', () => {
  const mockETFs = [
    {
      ticker: '069660',
      name: 'KODEX 반도체',
      type: 'ETF',
      theme: '반도체',
    },
    {
      ticker: '114800',
      name: 'KODEX 인버스',
      type: 'ETF',
      theme: '인버스',
    },
  ]

  it('ETF 카드들을 그리드로 표시한다', () => {
    render(<ETFCardGrid etfs={mockETFs} />)

    expect(screen.getByTestId('etf-card-069660')).toBeInTheDocument()
    expect(screen.getByTestId('etf-card-114800')).toBeInTheDocument()
  })


  it('빈 배열일 때도 렌더링된다', () => {
    render(<ETFCardGrid etfs={[]} />)

    expect(screen.queryByTestId(/etf-card/)).not.toBeInTheDocument()
  })
})

