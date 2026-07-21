import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders, screen, fireEvent, waitFor } from '../../test/utils'
import TickerForm from './TickerForm'

// alert 모킹
global.alert = vi.fn()

describe('TickerForm 컴포넌트', () => {
  const mockOnSubmit = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('생성 모드', () => {
    it('생성 모드로 폼이 렌더링된다', () => {
      renderWithProviders(
        <TickerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onClose={mockOnClose}
          isSubmitting={false}
        />
      )

      expect(screen.getByText('새 종목 추가')).toBeInTheDocument()
      expect(screen.getByText('추가')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/티커 코드 또는 종목명 검색/)).toBeInTheDocument()
    })

    it('네이버에서 자동 입력 버튼이 표시된다', () => {
      renderWithProviders(
        <TickerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onClose={mockOnClose}
          isSubmitting={false}
        />
      )

      // getAllByText로 여러 개의 "자동 입력" 텍스트 확인 (모바일/데스크톱)
      const autoFillTexts = screen.getAllByText(/자동 입력/)
      expect(autoFillTexts.length).toBeGreaterThan(0)
    })

    it('필수 필드 누락 시 검증 에러가 표시된다', async () => {
      renderWithProviders(
        <TickerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onClose={mockOnClose}
          isSubmitting={false}
        />
      )

      // 제출 버튼 클릭 (필드 입력 없이)
      const submitButton = screen.getByText('추가')
      fireEvent.click(submitButton)

      // 검증 에러 메시지 확인
      await waitFor(() => {
        expect(screen.getByText('티커 코드는 필수입니다.')).toBeInTheDocument()
        expect(screen.getByText('종목명은 필수입니다.')).toBeInTheDocument()
        expect(screen.getByText('테마는 필수입니다.')).toBeInTheDocument()
      })

      expect(mockOnSubmit).not.toHaveBeenCalled()
    })

    it('관련 키워드를 쉼표로 구분하여 입력할 수 있다', async () => {
      renderWithProviders(
        <TickerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onClose={mockOnClose}
          isSubmitting={false}
        />
      )

      // 관련 키워드 입력
      const keywordsInput = screen.getByPlaceholderText(/쉼표로 구분하여 입력/)
      fireEvent.change(keywordsInput, {
        target: { value: '삼성전자, 반도체, 전자, IT' },
      })

      // 입력값 확인
      expect(keywordsInput.value).toBe('삼성전자, 반도체, 전자, IT')
    })
  })

  describe('수정 모드', () => {
    const initialData = {
      ticker: '487240',
      name: '삼성 KODEX AI전력핵심설비 ETF',
      type: 'ETF',
      theme: 'AI & 전력 인프라',
      launch_date: '2024-03-15',
      expense_ratio: '0.45',
      search_keyword: 'KODEX AI',
      relevance_keywords: ['AI', '전력', '인프라'],
    }

    it('수정 모드로 폼이 렌더링된다', () => {
      renderWithProviders(
        <TickerForm
          mode="edit"
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onClose={mockOnClose}
          isSubmitting={false}
        />
      )

      expect(screen.getByText('종목 수정')).toBeInTheDocument()
      expect(screen.getByText('수정')).toBeInTheDocument()
    })

    it('초기 데이터가 폼에 채워진다', async () => {
      renderWithProviders(
        <TickerForm
          mode="edit"
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onClose={mockOnClose}
          isSubmitting={false}
        />
      )

      // 초기값 확인
      await waitFor(() => {
        expect(screen.getByDisplayValue('487240')).toBeInTheDocument()
        expect(screen.getByDisplayValue('삼성 KODEX AI전력핵심설비 ETF')).toBeInTheDocument()
        expect(screen.getByDisplayValue('AI & 전력 인프라')).toBeInTheDocument()
      })
    })

    it('수정 모드에서 티커 코드는 수정할 수 없다', async () => {
      renderWithProviders(
        <TickerForm
          mode="edit"
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onClose={mockOnClose}
          isSubmitting={false}
        />
      )

      await waitFor(() => {
        const tickerInput = screen.getByDisplayValue('487240')
        expect(tickerInput).toBeDisabled()
      })
    })

    it('수정 모드에서 자동 입력 버튼이 표시되지 않는다', async () => {
      renderWithProviders(
        <TickerForm
          mode="edit"
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onClose={mockOnClose}
          isSubmitting={false}
        />
      )

      await waitFor(() => {
        expect(screen.queryByText(/네이버에서 자동 입력/)).not.toBeInTheDocument()
      })
    })
  })

  describe('공통 기능', () => {
    it('취소 버튼 클릭 시 onClose가 호출된다', () => {
      renderWithProviders(
        <TickerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onClose={mockOnClose}
          isSubmitting={false}
        />
      )

      const cancelButton = screen.getByText('취소')
      fireEvent.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('제출 중일 때 버튼이 비활성화된다', () => {
      renderWithProviders(
        <TickerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onClose={mockOnClose}
          isSubmitting={true}
        />
      )

      const submitButton = screen.getByText('저장 중...')
      const cancelButton = screen.getByText('취소')

      expect(submitButton).toBeDisabled()
      expect(cancelButton).toBeDisabled()
    })
  })
})
