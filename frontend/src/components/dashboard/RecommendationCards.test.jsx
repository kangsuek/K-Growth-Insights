import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { server } from '../../test/mocks/server'
import RecommendationCards from './RecommendationCards'

const BASE_URL = 'http://localhost:8000/api'

const item = (over = {}) => ({
  ticker: '069500',
  name: '테스트종목',
  type: 'ETF',
  close_price: 10000,
  weekly_return: 12.34,
  foreign_net: 172238645,
  institutional_net: 2610767,
  volume: 999,
  is_registered: false,
  ...over,
})

const mockPresets = (presets) =>
  server.use(http.get(`${BASE_URL}/scanner/recommendations`, () => HttpResponse.json(presets)))

const cardOf = (title) => screen.getByText(title).closest('div').parentElement

describe('ETF 추천 카드', () => {
  it('순매수 상위 카드도 주간 수익률을 보여준다 (주수가 아니라)', async () => {
    mockPresets([
      { preset_id: 'weekly_top_return', title: '주간 수익률 상위', items: [item({ ticker: 'A', weekly_return: 69.11 })] },
      { preset_id: 'foreign_buying', title: '외국인 순매수 상위', items: [item({ ticker: 'B', weekly_return: 18.29 })] },
      { preset_id: 'institutional_buying', title: '기관 순매수 상위', items: [item({ ticker: 'C', weekly_return: -12.5 })] },
    ])
    renderWithProviders(<RecommendationCards />)

    expect(await screen.findByText('외국인 순매수 상위')).toBeInTheDocument()

    // 세 카드 모두 같은 형식(부호 + %) — 단위가 같아야 나란히 비교된다.
    // 방향은 부호와 색상이 말해 주므로 화살표(▲/▼)는 붙이지 않는다.
    expect(within(cardOf('주간 수익률 상위')).getByText('+69.11%')).toBeInTheDocument()
    expect(within(cardOf('외국인 순매수 상위')).getByText('+18.29%')).toBeInTheDocument()

    // 순매수 상위인데 주가는 빠진 종목 — 마이너스도 그대로 보여준다
    expect(within(cardOf('기관 순매수 상위')).getByText('-12.50%')).toBeInTheDocument()

    // 순매수 주수는 더 이상 표시하지 않는다
    expect(screen.queryByText(/172,238,645주/)).not.toBeInTheDocument()
    expect(screen.queryByText(/2,610,767주/)).not.toBeInTheDocument()
  })

  it('거래량 상위 카드는 주수를 유지한다 — 순위 기준이 주수라 %로 바꾸면 뜻이 사라진다', async () => {
    mockPresets([
      { preset_id: 'high_volume', title: '거래량 상위', items: [item({ volume: 119308004 })] },
    ])
    renderWithProviders(<RecommendationCards />)

    expect(await screen.findByText('거래량 상위')).toBeInTheDocument()
    expect(screen.getByText('119,308,004주')).toBeInTheDocument()
  })

  it('추천이 비면 아무것도 그리지 않는다', async () => {
    mockPresets([])
    const { container } = renderWithProviders(<RecommendationCards />)
    expect(container).toBeEmptyDOMElement()
  })
})
