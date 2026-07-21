import { describe, it, expect } from 'vitest'
import { renderWithProviders, screen, waitFor } from '../test/utils'
import Settings from './Settings'

describe('Settings 페이지', () => {
  it('페이지가 정상적으로 렌더링된다', async () => {
    renderWithProviders(<Settings />, {
      initialEntries: ['/settings'],
    })

    // 페이지 헤더 확인
    expect(screen.getByText('설정')).toBeInTheDocument()

    // TickerManagementPanel이 로드될 때까지 대기
    await waitFor(() => {
      expect(screen.getByText('종목 관리')).toBeInTheDocument()
    })
  })

  it('TickerManagementPanel 컴포넌트가 렌더링된다', async () => {
    renderWithProviders(<Settings />, {
      initialEntries: ['/settings'],
    })

    // 종목 관리 섹션이 로드될 때까지 대기
    await waitFor(() => {
      expect(screen.getByText('종목 관리')).toBeInTheDocument()
    })

    // 종목 관리 패널의 주요 요소 확인
    expect(screen.getByText('stocks.json 기반 종목 추가/수정/삭제')).toBeInTheDocument()
    expect(screen.getByText('새 종목 추가')).toBeInTheDocument()
  })

  it('모바일 반응형 스타일이 적용된다', () => {
    renderWithProviders(<Settings />, {
      initialEntries: ['/settings'],
    })

    const container = screen.getByText('설정').closest('.max-w-7xl')
    expect(container).toHaveClass('max-w-7xl', 'mx-auto', 'px-2', 'sm:px-0')
  })
})
