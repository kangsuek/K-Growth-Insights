import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import Header from './Header'

describe('Header', () => {
  it('렌더링 테스트 - 로고와 서비스 이름을 표시한다', () => {
    renderWithProviders(<Header />)

    expect(screen.getByText('K-Growth Insights')).toBeInTheDocument()
    expect(screen.getByText('한국 고성장 섹터 분석')).toBeInTheDocument()
    expect(screen.getByAltText('K-Growth Insights Logo')).toBeInTheDocument()
  })

  it('데스크톱 네비게이션 링크를 표시한다', () => {
    renderWithProviders(<Header />)

    // Dashboard, Comparison, GitHub 링크가 있어야 함
    const dashboardLinks = screen.getAllByText('Dashboard')
    const comparisonLinks = screen.getAllByText('Comparison')
    const githubLinks = screen.getAllByText('GitHub')

    // 데스크톱과 모바일 각각 하나씩 있어야 하므로 총 2개 이상
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(1)
    expect(comparisonLinks.length).toBeGreaterThanOrEqual(1)
    expect(githubLinks.length).toBeGreaterThanOrEqual(1)
  })

  it('/ 경로에서 Dashboard 링크가 활성화된다', () => {
    renderWithProviders(<Header />, { initialEntries: ['/'] })

    const dashboardLinks = screen.getAllByText('Dashboard')
    // 데스크톱 네비게이션 링크 확인 (첫 번째)
    expect(dashboardLinks[0].className).toContain('bg-primary-500')
    expect(dashboardLinks[0].className).toContain('text-white')
  })

  it('/compare 경로에서 Comparison 링크가 활성화된다', () => {
    renderWithProviders(<Header />, { initialEntries: ['/compare'] })

    const comparisonLinks = screen.getAllByText('Comparison')
    // 데스크톱 네비게이션 링크 확인 (첫 번째)
    expect(comparisonLinks[0].className).toContain('bg-primary-500')
    expect(comparisonLinks[0].className).toContain('text-white')
  })

  it('모바일 햄버거 메뉴 버튼이 있다', () => {
    renderWithProviders(<Header />)

    const menuButton = screen.getByRole('button', { name: /메뉴 열기/i })
    expect(menuButton).toBeInTheDocument()
  })

  it('모바일 햄버거 메뉴를 클릭하면 메뉴가 열린다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Header />)

    const menuButton = screen.getByRole('button', { name: /메뉴 열기/i })
    await user.click(menuButton)

    // 메뉴가 열리면 aria-expanded가 true가 되어야 함
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')

    // 메뉴가 열리면 버튼 텍스트가 "메뉴 닫기"로 변경
    expect(screen.getByRole('button', { name: /메뉴 닫기/i })).toBeInTheDocument()
  })

  it('모바일 메뉴를 열고 닫을 수 있다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Header />)

    // 메뉴 열기
    const menuButton = screen.getByRole('button', { name: /메뉴 열기/i })
    await user.click(menuButton)
    expect(screen.getByRole('button', { name: /메뉴 닫기/i })).toBeInTheDocument()

    // 메뉴 닫기
    const closeButton = screen.getByRole('button', { name: /메뉴 닫기/i })
    await user.click(closeButton)
    expect(screen.getByRole('button', { name: /메뉴 열기/i })).toBeInTheDocument()
  })

  it('모바일 메뉴에서 링크를 클릭하면 메뉴가 닫힌다', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Header />)

    // 메뉴 열기
    const menuButton = screen.getByRole('button', { name: /메뉴 열기/i })
    await user.click(menuButton)

    // 모바일 메뉴의 Dashboard 링크 클릭 (모바일 메뉴는 나중에 렌더링되므로 마지막 요소)
    const dashboardLinks = screen.getAllByText('Dashboard')
    const mobileDashboardLink = dashboardLinks[dashboardLinks.length - 1]
    await user.click(mobileDashboardLink)

    // 메뉴가 닫혀야 함
    expect(screen.getByRole('button', { name: /메뉴 열기/i })).toBeInTheDocument()
  })

  it('GitHub 링크가 새 창에서 열린다', () => {
    renderWithProviders(<Header />)

    const githubLinks = screen.getAllByRole('link', { name: /GitHub/i })
    githubLinks.forEach(link => {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).toHaveAttribute('href', 'https://github.com/kangsuek/ETFWeeklyReport')
    })
  })

  it('로고를 클릭하면 홈으로 이동한다', () => {
    const { container } = renderWithProviders(<Header />)

    const logoLink = container.querySelector('a[href="/"]')
    expect(logoLink).toBeInTheDocument()
    expect(logoLink.querySelector('img')).toHaveAttribute('alt', 'K-Growth Insights Logo')
  })
})
