import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { server } from '../../test/mocks/server'
import { http, HttpResponse } from 'msw'
import Footer from './Footer'

describe('Footer', () => {
  beforeEach(() => {
    // Setup default handler
    server.use(
      http.get('http://localhost:8000/api/data/scheduler-status', () => {
        return HttpResponse.json({
          scheduler: {
            last_collection_time: '2025-11-10T09:00:00',
            next_collection_time: '2025-11-10T15:00:00',
          },
        })
      })
    )
  })

  it('렌더링 테스트 - 서비스 정보를 표시한다', () => {
    renderWithProviders(<Footer />)

    expect(screen.getByText('K-Growth Insights')).toBeInTheDocument()
    expect(screen.getByText(/한국 고성장 섹터/)).toBeInTheDocument()
  })

  it('데이터 출처 정보를 표시한다', () => {
    renderWithProviders(<Footer />)

    expect(screen.getByText('데이터 출처')).toBeInTheDocument()
    expect(screen.getByText(/가격 데이터: Naver Finance/)).toBeInTheDocument()
    expect(screen.getByText(/매매 동향: Naver Finance/)).toBeInTheDocument()
    expect(screen.getByText(/뉴스 데이터: Naver News/)).toBeInTheDocument()
  })

  it('업데이트 시간을 표시한다', async () => {
    renderWithProviders(<Footer />)

    await waitFor(() => {
      expect(screen.getByText('마지막 업데이트:')).toBeInTheDocument()
    })

    // 시간 포맷팅 확인 (2025년 11월 10일 09:00 형식)
    await waitFor(() => {
      expect(screen.getByText(/2025년 11월 10일/)).toBeInTheDocument()
    })
  })

  it('업데이트 시간 로딩 실패 시 "-"를 표시한다', async () => {
    server.use(
      http.get('http://localhost:8000/api/data/scheduler-status', () => {
        return new HttpResponse(null, { status: 500 })
      })
    )

    renderWithProviders(<Footer />)

    await waitFor(() => {
      expect(screen.getByText('마지막 업데이트:')).toBeInTheDocument()
    })

    // 실패 시 "-" 표시 (formatUpdateTime이 undefined를 받으면 '-' 반환)
    await waitFor(() => {
      // 업데이트 시간을 표시하는 <p> 태그 찾기 - "-" 텍스트가 있어야 함
      const dashText = screen.getByText('-')
      expect(dashText).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('GitHub 저장소 링크를 표시한다', () => {
    renderWithProviders(<Footer />)

    const githubLinks = screen.getAllByRole('link', { name: /GitHub 저장소/i })
    expect(githubLinks.length).toBeGreaterThan(0)

    githubLinks.forEach(link => {
      expect(link).toHaveAttribute('href', 'https://github.com/kangsuek/ETFWeeklyReport')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  it('저작권 정보를 표시한다', () => {
    renderWithProviders(<Footer />)

    expect(screen.getByText(/© 2025 K-Growth Insights. All rights reserved./)).toBeInTheDocument()
  })

  it('면책 조항을 표시한다', () => {
    renderWithProviders(<Footer />)

    expect(screen.getByText(/본 정보는 투자 참고용이며, 투자 권유가 아닙니다/)).toBeInTheDocument()
  })

  it('contentinfo role을 가진다', () => {
    const { container } = renderWithProviders(<Footer />)

    const footer = container.querySelector('footer')
    expect(footer).toHaveAttribute('role', 'contentinfo')
  })

  it('리스트 항목에 role="list"를 가진다', () => {
    const { container } = renderWithProviders(<Footer />)

    const list = container.querySelector('ul[role="list"]')
    expect(list).toBeInTheDocument()
  })
})
