import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders, screen, fireEvent } from '../../test/utils'
import TickerDeleteConfirm from './TickerDeleteConfirm'

describe('TickerDeleteConfirm 컴포넌트', () => {
  const mockOnConfirm = vi.fn()
  const mockOnClose = vi.fn()

  const mockTicker = {
    ticker: '487240',
    name: '삼성 KODEX AI전력핵심설비 ETF',
    type: 'ETF',
    theme: 'AI & 전력 인프라',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('삭제 확인 모달이 정상적으로 렌더링된다', () => {
    renderWithProviders(
      <TickerDeleteConfirm
        ticker={mockTicker}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={false}
      />
    )

    expect(screen.getByText('종목 삭제 확인')).toBeInTheDocument()
    expect(screen.getByText(/정말.*삭제하시겠습니까/)).toBeInTheDocument()
  })

  it('종목 정보가 정확하게 표시된다', () => {
    renderWithProviders(
      <TickerDeleteConfirm
        ticker={mockTicker}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={false}
      />
    )

    expect(screen.getByText(/487240 \(삼성 KODEX AI전력핵심설비 ETF\)/)).toBeInTheDocument()
  })

  it('삭제될 데이터 경고가 표시된다', () => {
    renderWithProviders(
      <TickerDeleteConfirm
        ticker={mockTicker}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={false}
      />
    )

    expect(screen.getByText(/다음 데이터가 함께 삭제됩니다/)).toBeInTheDocument()
    expect(screen.getByText(/stocks.json 파일에서 종목 정보 제거/)).toBeInTheDocument()
    expect(screen.getByText(/데이터베이스의 모든 가격 데이터/)).toBeInTheDocument()
    expect(screen.getByText(/데이터베이스의 모든 뉴스 데이터/)).toBeInTheDocument()
    expect(screen.getByText(/데이터베이스의 모든 매매 동향 데이터/)).toBeInTheDocument()
  })

  it('되돌릴 수 없음 경고가 표시된다', () => {
    renderWithProviders(
      <TickerDeleteConfirm
        ticker={mockTicker}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={false}
      />
    )

    expect(screen.getByText(/이 작업은 되돌릴 수 없습니다/)).toBeInTheDocument()
  })

  it('취소 버튼 클릭 시 onClose가 호출된다', () => {
    renderWithProviders(
      <TickerDeleteConfirm
        ticker={mockTicker}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={false}
      />
    )

    const cancelButton = screen.getByText('취소')
    fireEvent.click(cancelButton)

    expect(mockOnClose).toHaveBeenCalled()
    expect(mockOnConfirm).not.toHaveBeenCalled()
  })

  it('삭제 버튼 클릭 시 onConfirm이 호출된다', () => {
    renderWithProviders(
      <TickerDeleteConfirm
        ticker={mockTicker}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={false}
      />
    )

    // "삭제" 버튼 찾기 (빨간색 배경)
    const deleteButton = screen.getAllByText('삭제').find(btn =>
      btn.closest('button')?.className.includes('bg-red-600')
    )

    fireEvent.click(deleteButton)

    expect(mockOnConfirm).toHaveBeenCalled()
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('삭제 중일 때 버튼이 비활성화되고 로딩 표시된다', () => {
    renderWithProviders(
      <TickerDeleteConfirm
        ticker={mockTicker}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={true}
      />
    )

    const deleteButton = screen.getByText('삭제 중...')
    const cancelButton = screen.getByText('취소')

    expect(deleteButton).toBeDisabled()
    expect(cancelButton).toBeDisabled()

    // 로딩 스피너 확인
    const spinner = deleteButton.querySelector('svg.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('ticker가 null이면 렌더링되지 않는다', () => {
    const { container } = renderWithProviders(
      <TickerDeleteConfirm
        ticker={null}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={false}
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('경고 아이콘이 표시된다', () => {
    renderWithProviders(
      <TickerDeleteConfirm
        ticker={mockTicker}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={false}
      />
    )

    // 경고 아이콘 컨테이너 확인
    const iconContainer = document.querySelector('.bg-red-100')
    expect(iconContainer).toBeInTheDocument()
  })

  it('모바일 반응형 스타일이 적용된다', () => {
    renderWithProviders(
      <TickerDeleteConfirm
        ticker={mockTicker}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={false}
      />
    )

    const modal = screen.getByText('종목 삭제 확인').closest('.bg-white')
    expect(modal).toHaveClass('max-w-md', 'max-h-[95vh]', 'sm:max-h-auto')
  })

  it('버튼이 모바일에서 세로 배치, 데스크톱에서 가로 배치된다', () => {
    renderWithProviders(
      <TickerDeleteConfirm
        ticker={mockTicker}
        onConfirm={mockOnConfirm}
        onClose={mockOnClose}
        isDeleting={false}
      />
    )

    const buttonContainer = screen.getByText('취소').closest('.flex')
    expect(buttonContainer).toHaveClass('flex-col', 'sm:flex-row')
  })
})
