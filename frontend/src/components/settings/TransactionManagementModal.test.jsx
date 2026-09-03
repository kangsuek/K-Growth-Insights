import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderWithProviders, screen, waitFor, within } from '../../test/utils'
import { server } from '../../test/mocks/server'
import TransactionManagementModal from './TransactionManagementModal'

const BASE_URL = 'http://localhost:8000/api'
const stock = { ticker: '005930', name: '삼성전자', purchase_price: 75000, quantity: 20 }

describe('TransactionManagementModal 컴포넌트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('빈 거래내역이면 안내 문구를 표시한다', async () => {
    renderWithProviders(<TransactionManagementModal stock={stock} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('등록된 거래내역이 없습니다.')).toBeInTheDocument()
    })
    expect(screen.getByText(/삼성전자/)).toBeInTheDocument()
  })

  it('현재 평단가·보유수량 요약을 표시한다', async () => {
    renderWithProviders(<TransactionManagementModal stock={stock} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('75,000원')).toBeInTheDocument()
      expect(screen.getByText('20주')).toBeInTheDocument()
    })
  })

  it('거래내역 목록을 표시한다', async () => {
    server.use(
      http.get(`${BASE_URL}/settings/stocks/:ticker/transactions`, () =>
        HttpResponse.json([
          { id: 1, ticker: '005930', transaction_type: 'BUY', transaction_date: '2026-01-10', price: 70000, quantity: 10, realized_pnl: null, note: null },
          { id: 2, ticker: '005930', transaction_type: 'SELL', transaction_date: '2026-02-10', price: 90000, quantity: 4, realized_pnl: 80000, note: null },
        ])
      )
    )

    renderWithProviders(<TransactionManagementModal stock={stock} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
    const table = within(screen.getByRole('table'))
    expect(table.getByText('2026-01-10')).toBeInTheDocument()
    expect(table.getByText('2026-02-10')).toBeInTheDocument()
    expect(table.getByText('매수')).toBeInTheDocument()
    expect(table.getByText('매도')).toBeInTheDocument()
    expect(table.getByText('80,000')).toBeInTheDocument() // 실현손익
  })

  it('필수 입력값이 없으면 거래를 추가하지 않고 에러를 표시한다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TransactionManagementModal stock={stock} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('등록된 거래내역이 없습니다.')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '추가' }))

    await waitFor(() => {
      expect(screen.getByText('날짜·가격·수량을 모두 입력하세요.')).toBeInTheDocument()
    })
  })

  it('초과 매도 등 400 응답을 폼 위에 인라인으로 표시한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`${BASE_URL}/settings/stocks/:ticker/transactions`, () =>
        new HttpResponse(JSON.stringify({ detail: '보유 수량을 초과합니다' }), { status: 400 })
      )
    )

    renderWithProviders(<TransactionManagementModal stock={stock} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('등록된 거래내역이 없습니다.')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('날짜'), '2026-03-01')
    await user.type(screen.getByLabelText('가격(원)'), '90000')
    await user.type(screen.getByLabelText('수량'), '100')
    await user.click(screen.getByRole('button', { name: '추가' }))

    await waitFor(() => {
      expect(screen.getByText('보유 수량을 초과합니다')).toBeInTheDocument()
    })
  })

  it('거래를 수정하면 저장 후 편집 행이 닫힌다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${BASE_URL}/settings/stocks/:ticker/transactions`, () =>
        HttpResponse.json([
          { id: 1, ticker: '005930', transaction_type: 'BUY', transaction_date: '2026-01-10', price: 70000, quantity: 10, realized_pnl: null, note: null },
        ])
      )
    )

    renderWithProviders(<TransactionManagementModal stock={stock} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: '수정' }))

    // 편집 행의 가격 입력(고유 aria-label — 생성 폼의 '가격(원)'과 충돌하지 않음)
    const priceInput = screen.getByLabelText('거래 가격 수정')
    await user.clear(priceInput)
    await user.type(priceInput, '72000')

    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('거래 가격 수정')).not.toBeInTheDocument()
    })
  })

  it('가격·수량 없이 저장을 시도하면 거부되고 요청을 보내지 않는다', async () => {
    const user = userEvent.setup()
    let putCalled = false
    server.use(
      http.get(`${BASE_URL}/settings/stocks/:ticker/transactions`, () =>
        HttpResponse.json([
          { id: 1, ticker: '005930', transaction_type: 'BUY', transaction_date: '2026-01-10', price: 70000, quantity: 10, realized_pnl: null, note: null },
        ])
      ),
      http.put(`${BASE_URL}/settings/stocks/transactions/:id`, () => {
        putCalled = true
        return HttpResponse.json({})
      })
    )

    renderWithProviders(<TransactionManagementModal stock={stock} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: '수정' }))
    const priceInput = screen.getByLabelText('거래 가격 수정')
    await user.clear(priceInput)
    await user.click(screen.getByRole('button', { name: '저장' }))

    // 편집 행이 그대로 남아 있어야 한다(저장이 거부됨).
    expect(screen.getByLabelText('거래 가격 수정')).toBeInTheDocument()
    expect(putCalled).toBe(false)
  })

  it('거래를 삭제하면 목록에서 제거된다', async () => {
    const user = userEvent.setup()
    let rows = [
      { id: 1, ticker: '005930', transaction_type: 'BUY', transaction_date: '2026-01-10', price: 70000, quantity: 10, realized_pnl: null, note: null },
    ]
    server.use(
      http.get(`${BASE_URL}/settings/stocks/:ticker/transactions`, () => HttpResponse.json(rows)),
      http.delete(`${BASE_URL}/settings/stocks/transactions/:id`, ({ params }) => {
        rows = rows.filter((r) => r.id !== Number(params.id))
        return new HttpResponse(null, { status: 204 })
      })
    )

    renderWithProviders(<TransactionManagementModal stock={stock} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: '삭제' }))

    await waitFor(() => {
      expect(screen.getByText('등록된 거래내역이 없습니다.')).toBeInTheDocument()
    })
  })

  it('닫기 버튼 클릭 시 onClose가 호출된다', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<TransactionManagementModal stock={stock} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('등록된 거래내역이 없습니다.')).toBeInTheDocument()
    })

    // 헤더의 X 닫기 버튼 (svg만 있는 버튼)
    const closeButtons = screen.getAllByRole('button')
    const xButton = closeButtons.find((b) => b.querySelector('svg path[d^="M6 18L18 6"]'))
    await user.click(xButton)

    expect(onClose).toHaveBeenCalled()
  })
})
