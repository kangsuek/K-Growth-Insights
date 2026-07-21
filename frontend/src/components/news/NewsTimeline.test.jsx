import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import NewsTimeline from './NewsTimeline'
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
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<NewsTimeline ticker="411060" />)

    await waitFor(() => {
      expect(screen.getByText('2차전지 ETF 투자자 관심 집중')).toBeInTheDocument()
    })

    expect(screen.getByText('2차전지 시장 전망 긍정적')).toBeInTheDocument()
    expect(screen.getByText('3일 뉴스')).toBeInTheDocument()
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

  it('관련도 점수를 시각적으로 표시한다', async () => {
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<NewsTimeline ticker="411060" />)

    await waitFor(() => {
      expect(screen.getByText('85%')).toBeInTheDocument()
      expect(screen.getByText('75%')).toBeInTheDocument()
    })
  })

  it('뉴스 링크가 올바르게 설정된다', async () => {
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<NewsTimeline ticker="411060" />)

    await waitFor(() => {
      const link = screen.getByText('2차전지 ETF 투자자 관심 집중').closest('a')
      expect(link).toHaveAttribute('href', 'https://example.com/news/1')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })
})

