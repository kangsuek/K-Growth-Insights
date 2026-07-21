import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders, screen, waitFor, within } from '../../test/utils'
import { server } from '../../test/mocks/server'
import TickerManagementPanel from './TickerManagementPanel'

// alert 모킹
global.alert = vi.fn()

describe('TickerManagementPanel 컴포넌트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('컴포넌트가 정상적으로 렌더링된다', () => {
    renderWithProviders(<TickerManagementPanel />)

    // 초기 로딩 중에도 존재하는 요소들 확인
    expect(document.querySelector('.bg-white')).toBeInTheDocument()
  })

  it('로딩 상태가 정상적으로 표시된다', () => {
    renderWithProviders(<TickerManagementPanel />)

    // 로딩 스켈레톤 확인
    const skeleton = document.querySelector('.animate-pulse')
    expect(skeleton).toBeInTheDocument()
  })

  it('종목 삭제 시 목록에서 즉시 제거된다', async () => {
    const user = userEvent.setup()
    let currentStocks = [
      {
        ticker: '487240',
        name: '삼성 KODEX AI전력핵심설비 ETF',
        type: 'ETF',
        theme: 'AI & 전력 인프라',
      },
      {
        ticker: '466920',
        name: '신한 SOL 조선TOP3플러스 ETF',
        type: 'ETF',
        theme: '조선/해운',
      },
    ]

    const listHandler = () => HttpResponse.json(currentStocks)
    const deleteHandler = ({ params }) => {
      currentStocks = currentStocks.filter((stock) => stock.ticker !== params.ticker)
      return HttpResponse.json({
        ticker: params.ticker,
        deleted: {
          prices: 0,
          news: 0,
          trading_flow: 0,
        },
      })
    }

    server.use(
      http.get('/api/etfs/', listHandler),
      http.get('/api/etfs', listHandler),
      http.get('http://localhost:8000/api/etfs/', listHandler),
      http.get('http://localhost:8000/api/etfs', listHandler),
      http.delete('/api/settings/stocks/:ticker', deleteHandler),
      http.delete('http://localhost:8000/api/settings/stocks/:ticker', deleteHandler)
    )

    renderWithProviders(<TickerManagementPanel />)

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    const table = screen.getByRole('table')
    const dataRows = within(table).getAllByRole('row').slice(1)
    const firstRow = dataRows[0]
    await user.click(within(firstRow).getByRole('button', { name: '삭제' }))

    const confirmButton = screen
      .getAllByRole('button', { name: '삭제' })
      .find((button) => button.closest('.fixed'))
    expect(confirmButton).toBeDefined()
    await user.click(confirmButton)

    await waitFor(() => {
      const updatedTable = screen.getByRole('table')
      expect(within(updatedTable).queryByText('삼성 KODEX AI전력핵심설비 ETF')).not.toBeInTheDocument()
    })
  })
})
