import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import NewsTimeline, { openNewsWindow } from './NewsTimeline'
import * as api from '../../services/api'

const mockNews = [
  {
    id: 1,
    ticker: '411060',
    title: '2차전지 ETF 투자자 관심 집중',
    url: 'https://example.com/news/1',
    source: '한국경제',
    date: '2024-01-01T10:00:00',
    published_at: '2024-01-01T10:00:00',
    relevance_score: 0.85,
  },
  {
    id: 2,
    ticker: '411060',
    title: '2차전지 시장 전망 긍정적',
    url: 'https://example.com/news/2',
    source: '매일경제',
    date: '2024-01-01T14:30:00',
    published_at: '2024-01-01T14:30:00',
    relevance_score: 0.75,
  },
  {
    id: 3,
    ticker: '411060',
    title: '3일 뉴스',
    url: 'https://example.com/news/3',
    source: '조선일보',
    date: '2024-01-03T09:00:00',
    published_at: '2024-01-03T09:00:00',
    relevance_score: 0.6,
  },
]

describe('NewsTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('뉴스 목록을 타임라인 형태로 표시한다', async () => {
    const user = userEvent.setup()
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<NewsTimeline ticker="411060" />)

    // 최신 날짜 그룹(01/03)은 기본 펼침 → 3일 뉴스가 먼저 보인다
    await waitFor(() => {
      expect(screen.getByText('3일 뉴스')).toBeInTheDocument()
    })

    // 옛 날짜(01/01) 그룹을 펼치면 해당 뉴스가 표시된다
    await user.click(screen.getByText('2024년 01월 01일'))
    expect(screen.getByText('2차전지 ETF 투자자 관심 집중')).toBeInTheDocument()
    expect(screen.getByText('2차전지 시장 전망 긍정적')).toBeInTheDocument()
  })

  it('날짜별로 그룹핑하여 표시한다', async () => {
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<NewsTimeline ticker="411060" />)

    await waitFor(() => {
      expect(screen.getByText('2024년 01월 01일')).toBeInTheDocument()
      expect(screen.getByText('2024년 01월 03일')).toBeInTheDocument()
    })
  })

  it('로딩 중일 때 스켈레톤을 표시한다', () => {
    vi.spyOn(api.newsApi, 'getByTicker').mockImplementation(
      () => new Promise(() => {}) // 무한 대기
    )

    renderWithProviders(<NewsTimeline ticker="411060" />)

    // 스켈레톤이 표시되는지 확인 (animate-pulse 클래스)
    const skeleton = document.querySelector('.animate-pulse')
    expect(skeleton).toBeInTheDocument()
  })

  it('에러 발생 시 에러 메시지를 표시한다', async () => {
    vi.spyOn(api.newsApi, 'getByTicker').mockRejectedValue(new Error('API 에러'))

    renderWithProviders(<NewsTimeline ticker="411060" />)

    await waitFor(() => {
      expect(screen.getByText('뉴스를 불러오는데 실패했습니다')).toBeInTheDocument()
    })
  })

  it('뉴스가 없을 때 빈 상태 메시지를 표시한다', async () => {
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: [] })

    renderWithProviders(<NewsTimeline ticker="411060" />)

    await waitFor(() => {
      expect(screen.getByText('최근 뉴스가 없습니다')).toBeInTheDocument()
    })
  })

  it('뉴스 링크가 올바르게 설정된다', async () => {
    const user = userEvent.setup()
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<NewsTimeline ticker="411060" />)

    // 대상 뉴스(01/01)는 접힌 그룹에 있으므로 먼저 펼친다
    await waitFor(() => expect(screen.getByText('2024년 01월 01일')).toBeInTheDocument())
    await user.click(screen.getByText('2024년 01월 01일'))

    const link = screen.getByText('2차전지 ETF 투자자 관심 집중').closest('a')
    expect(link).toHaveAttribute('href', 'https://example.com/news/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  describe('뉴스 창 열기', () => {
    const openNewsList = async (user) => {
      vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })
      renderWithProviders(<NewsTimeline ticker="411060" />)

      await waitFor(() => expect(screen.getByText('2024년 01월 01일')).toBeInTheDocument())
      await user.click(screen.getByText('2024년 01월 01일'))

      return screen.getByText('2차전지 ETF 투자자 관심 집중').closest('a')
    }

    it('화면 크기의 80%로, 최대 크기 안에서 창을 연다', () => {
      const fakeWindow = { opener: {} }
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow)
      vi.spyOn(window, 'screen', 'get').mockReturnValue({ availWidth: 1000, availHeight: 800 })

      openNewsWindow('https://example.com/news/1')

      // 1000*0.8=800, 800*0.8=640 → 최대값(1400x950)보다 작으므로 그대로
      expect(openSpy).toHaveBeenCalledWith(
        'https://example.com/news/1',
        '_blank',
        'width=800,height=640,left=100,top=80'
      )
    })

    it('화면이 매우 크면 최대 크기에서 멈춘다', () => {
      vi.spyOn(window, 'open').mockReturnValue({ opener: {} })
      vi.spyOn(window, 'screen', 'get').mockReturnValue({ availWidth: 5000, availHeight: 3000 })

      openNewsWindow('https://example.com/news/1')

      expect(window.open).toHaveBeenCalledWith(
        'https://example.com/news/1',
        '_blank',
        'width=1400,height=950,left=1800,top=1025'
      )
    })

    it('열린 창의 opener를 끊는다', () => {
      const fakeWindow = { opener: {} }
      vi.spyOn(window, 'open').mockReturnValue(fakeWindow)

      openNewsWindow('https://example.com/news/1')

      expect(fakeWindow.opener).toBeNull()
    })

    it('크기 지정 창이 막히면 크기 없이 다시 연다', () => {
      const fallbackWindow = { opener: {} }
      const openSpy = vi
        .spyOn(window, 'open')
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(fallbackWindow)

      const opened = openNewsWindow('https://example.com/news/1')

      expect(openSpy).toHaveBeenCalledTimes(2)
      expect(openSpy).toHaveBeenLastCalledWith('https://example.com/news/1', '_blank')
      expect(opened).toBe(fallbackWindow)
    })

    it('url이 없으면 창을 열지 않는다', () => {
      const openSpy = vi.spyOn(window, 'open')

      expect(openNewsWindow(undefined)).toBeNull()
      expect(openSpy).not.toHaveBeenCalled()
    })

    it('뉴스를 클릭하면 크기 지정한 창으로 연다', async () => {
      const user = userEvent.setup()
      const openSpy = vi.spyOn(window, 'open').mockReturnValue({ opener: {} })

      const link = await openNewsList(user)
      await user.click(link)

      expect(openSpy).toHaveBeenCalledWith(
        'https://example.com/news/1',
        '_blank',
        expect.stringContaining('width=')
      )
    })

    it('cmd/ctrl 클릭은 브라우저 기본 동작에 맡긴다', async () => {
      const user = userEvent.setup()
      const openSpy = vi.spyOn(window, 'open').mockReturnValue({ opener: {} })

      const link = await openNewsList(user)
      await user.keyboard('{Meta>}')
      await user.click(link)
      await user.keyboard('{/Meta}')

      expect(openSpy).not.toHaveBeenCalled()
    })
  })
})

