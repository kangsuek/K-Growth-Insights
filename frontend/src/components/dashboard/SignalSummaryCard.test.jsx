import { describe, it, expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import SignalSummaryCard from './SignalSummaryCard'

const etfs = [
  { ticker: '005930', name: '삼성전자' },
  { ticker: '000660', name: 'SK하이닉스' },
  { ticker: '009150', name: '삼성전기' },
]

describe('오늘의 신호 요약 카드', () => {
  it('신호가 있는 종목만 나열하고 배지를 보여준다', () => {
    const batchSummary = {
      '005930': { macd_cross_signal: 'golden', rsi_zone_entered: null },
      '000660': { macd_cross_signal: null, rsi_zone_entered: 'oversold' },
      '009150': { macd_cross_signal: null, rsi_zone_entered: null },
    }
    renderWithProviders(<SignalSummaryCard etfs={etfs} batchSummary={batchSummary} />)

    expect(screen.getByText('오늘의 신호 2건')).toBeInTheDocument()
    expect(within(screen.getByText('삼성전자').closest('a')).getByText('▲골든크로스')).toBeInTheDocument()
    expect(within(screen.getByText('SK하이닉스').closest('a')).getByText('RSI 과매도')).toBeInTheDocument()
    expect(screen.queryByText('삼성전기')).not.toBeInTheDocument()
  })

  it('오늘 신호가 없으면 아무것도 렌더링하지 않는다', () => {
    const batchSummary = {
      '005930': { macd_cross_signal: null, rsi_zone_entered: null },
      '000660': { macd_cross_signal: null, rsi_zone_entered: null },
      '009150': {},
    }
    const { container } = renderWithProviders(
      <SignalSummaryCard etfs={etfs} batchSummary={batchSummary} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('batchSummary가 아직 없으면(로딩 중) 렌더링하지 않는다', () => {
    const { container } = renderWithProviders(<SignalSummaryCard etfs={etfs} batchSummary={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
