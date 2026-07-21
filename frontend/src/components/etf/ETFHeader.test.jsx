import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ETFHeader from './ETFHeader'

describe('ETFHeader', () => {
  it('ETF 정보를 올바르게 표시한다', () => {
    const etf = {
      name: 'KODEX 반도체',
      ticker: '069660',
      theme: '반도체',
    }

    render(<ETFHeader etf={etf} />)

    expect(screen.getByText('KODEX 반도체')).toBeInTheDocument()
    expect(screen.getByText('069660 · 반도체')).toBeInTheDocument()
  })

  it('ETF 정보가 없을 때 기본값을 표시한다', () => {
    render(<ETFHeader etf={null} />)

    expect(screen.getByText('ETF 상세')).toBeInTheDocument()
  })

  it('ETF 정보가 부분적으로 없을 때도 렌더링된다', () => {
    const etf = {
      name: 'KODEX 반도체',
      ticker: '069660',
    }

    render(<ETFHeader etf={etf} />)

    expect(screen.getByText('KODEX 반도체')).toBeInTheDocument()
    expect(screen.getByText('069660 · undefined')).toBeInTheDocument()
  })
})

