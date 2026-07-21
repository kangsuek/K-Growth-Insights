import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../test/utils'
import ETFDetail from './ETFDetail'
import * as api from '../services/api'

// React Router의 useParams를 모킹
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ ticker: '411060' }),
  }
})

// Mock 데이터
const mockETF = {
  ticker: '411060',
  name: 'ACE 2차전지PLUS',
  type: 'ETF',
  theme: '2차전지',
  expense_ratio: 0.45,
  listing_date: '2020-12-14',
}

const mockPrices = [
  {
    id: 1,
    date: '2024-01-01',
    open_price: 10000,
    high_price: 10500,
    low_price: 9800,
    close_price: 10200,
    volume: 1000000,
    daily_change_pct: 2.5,
  },
  {
    id: 2,
    date: '2024-01-02',
    open_price: 10200,
    high_price: 10700,
    low_price: 10100,
    close_price: 10500,
    volume: 1200000,
    daily_change_pct: 2.94,
  },
]

const mockTradingFlow = [
  {
    id: 1,
    date: '2024-01-01',
    individual_net: 5000000000,
    institutional_net: -3000000000,
    foreign_net: -2000000000,
  },
  {
    id: 2,
    date: '2024-01-02',
    individual_net: -2000000000,
    institutional_net: 3000000000,
    foreign_net: -1000000000,
  },
]

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
]

describe('ETFDetail', () => {
  beforeEach(() => {
    // API 모킹 초기화
    vi.clearAllMocks()
  })

  it('페이지가 정상적으로 렌더링된다', async () => {
    // API 모킹
    vi.spyOn(api.etfApi, 'getDetail').mockResolvedValue({ data: mockETF })
    vi.spyOn(api.etfApi, 'getPrices').mockResolvedValue({ data: mockPrices })
    vi.spyOn(api.etfApi, 'getTradingFlow').mockResolvedValue({ data: mockTradingFlow })
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<ETFDetail />)

    // ETF 정보 로드 대기
    await waitFor(() => {
      expect(screen.getByText('ACE 2차전지PLUS')).toBeInTheDocument()
    })

    // 기본 정보 확인
    expect(screen.getByText('411060 · 2차전지')).toBeInTheDocument()
    expect(screen.getByText('종목 정보')).toBeInTheDocument()
  })

  it('종목 정보 섹션이 올바르게 표시된다', async () => {
    vi.spyOn(api.etfApi, 'getDetail').mockResolvedValue({ data: mockETF })
    vi.spyOn(api.etfApi, 'getPrices').mockResolvedValue({ data: mockPrices })
    vi.spyOn(api.etfApi, 'getTradingFlow').mockResolvedValue({ data: mockTradingFlow })
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<ETFDetail />)

    await waitFor(() => {
      expect(screen.getByText('411060')).toBeInTheDocument()
    })

    // 타입 뱃지 확인
    expect(screen.getByText('ETF')).toBeInTheDocument()

    // 테마 확인
    expect(screen.getByText('2차전지')).toBeInTheDocument()

    // 운용보수 확인
    expect(screen.getByText('0.45%')).toBeInTheDocument()
  })

  it('최근 가격 정보가 표시된다', async () => {
    vi.spyOn(api.etfApi, 'getDetail').mockResolvedValue({ data: mockETF })
    vi.spyOn(api.etfApi, 'getPrices').mockResolvedValue({ data: mockPrices })
    vi.spyOn(api.etfApi, 'getTradingFlow').mockResolvedValue({ data: mockTradingFlow })
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<ETFDetail />)

    await waitFor(() => {
      expect(screen.getByText('최근 가격 정보')).toBeInTheDocument()
    })

    // 등락률 확인 (여러 곳에 표시되므로 getAllByText 사용)
    await waitFor(() => {
      const changeElements = screen.getAllByText('+2.94%')
      expect(changeElements.length).toBeGreaterThan(0)
    })
  })

  it('가격 차트 섹션이 표시된다', async () => {
    vi.spyOn(api.etfApi, 'getDetail').mockResolvedValue({ data: mockETF })
    vi.spyOn(api.etfApi, 'getPrices').mockResolvedValue({ data: mockPrices })
    vi.spyOn(api.etfApi, 'getTradingFlow').mockResolvedValue({ data: mockTradingFlow })
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<ETFDetail />)

    await waitFor(() => {
      expect(screen.getByText('가격 차트')).toBeInTheDocument()
    })
  })

  it('매매 동향 차트 섹션이 표시된다', async () => {
    vi.spyOn(api.etfApi, 'getDetail').mockResolvedValue({ data: mockETF })
    vi.spyOn(api.etfApi, 'getPrices').mockResolvedValue({ data: mockPrices })
    vi.spyOn(api.etfApi, 'getTradingFlow').mockResolvedValue({ data: mockTradingFlow })
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<ETFDetail />)

    await waitFor(() => {
      expect(screen.getByText('투자자별 매매 동향')).toBeInTheDocument()
    })
  })

  it('뉴스 타임라인이 표시된다', async () => {
    vi.spyOn(api.etfApi, 'getDetail').mockResolvedValue({ data: mockETF })
    vi.spyOn(api.etfApi, 'getPrices').mockResolvedValue({ data: mockPrices })
    vi.spyOn(api.etfApi, 'getTradingFlow').mockResolvedValue({ data: mockTradingFlow })
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<ETFDetail />)

    await waitFor(() => {
      expect(screen.getByText('최근 뉴스')).toBeInTheDocument()
    })

    // 뉴스 제목 확인
    await waitFor(() => {
      expect(screen.getByText('2차전지 ETF 투자자 관심 집중')).toBeInTheDocument()
      expect(screen.getByText('2차전지 시장 전망 긍정적')).toBeInTheDocument()
    })
  })

  it('ETF 로딩 실패 시 에러 메시지를 표시한다', async () => {
    const error = new Error('데이터를 불러올 수 없습니다')
    vi.spyOn(api.etfApi, 'getDetail').mockRejectedValue(error)

    renderWithProviders(<ETFDetail />)

    await waitFor(
      () => {
        expect(screen.getByText('오류')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )

    // 중복 텍스트가 있으므로 getAllByText 사용
    const errorMessages = screen.getAllByText('데이터를 불러올 수 없습니다')
    expect(errorMessages.length).toBeGreaterThan(0)
  })

  it.skip('가격 데이터 로딩 실패 시 에러 폴백을 표시한다', async () => {
    vi.spyOn(api.etfApi, 'getDetail').mockResolvedValue({ data: mockETF })
    vi.spyOn(api.etfApi, 'getPrices').mockRejectedValue(new Error('가격 데이터 로드 실패'))
    vi.spyOn(api.etfApi, 'getTradingFlow').mockResolvedValue({ data: mockTradingFlow })
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<ETFDetail />)

    await waitFor(() => {
      expect(screen.getByText('ACE 2차전지PLUS')).toBeInTheDocument()
    })

    // 에러 폴백 확인
    await waitFor(() => {
      expect(screen.getByText('데이터를 불러오는데 실패했습니다')).toBeInTheDocument()
    })
  })

  it.skip('매매 동향 데이터 로딩 실패 시 에러 폴백을 표시한다', async () => {
    vi.spyOn(api.etfApi, 'getDetail').mockResolvedValue({ data: mockETF })
    vi.spyOn(api.etfApi, 'getPrices').mockResolvedValue({ data: mockPrices })
    vi.spyOn(api.etfApi, 'getTradingFlow').mockRejectedValue(
      new Error('매매 동향 데이터 로드 실패')
    )
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<ETFDetail />)

    await waitFor(() => {
      expect(screen.getByText('ACE 2차전지PLUS')).toBeInTheDocument()
    })

    // 에러 폴백 확인
    await waitFor(() => {
      expect(screen.getByText('데이터를 불러오는데 실패했습니다')).toBeInTheDocument()
    })
  })

  it('뉴스 데이터 없을 때 빈 상태 메시지를 표시한다', async () => {
    vi.spyOn(api.etfApi, 'getDetail').mockResolvedValue({ data: mockETF })
    vi.spyOn(api.etfApi, 'getPrices').mockResolvedValue({ data: mockPrices })
    vi.spyOn(api.etfApi, 'getTradingFlow').mockResolvedValue({ data: mockTradingFlow })
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: [] })

    renderWithProviders(<ETFDetail />)

    await waitFor(() => {
      expect(screen.getByText('최근 뉴스')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText('최근 뉴스가 없습니다')).toBeInTheDocument()
    })
  })

  it('날짜 범위 선택기가 표시된다', async () => {
    vi.spyOn(api.etfApi, 'getDetail').mockResolvedValue({ data: mockETF })
    vi.spyOn(api.etfApi, 'getPrices').mockResolvedValue({ data: mockPrices })
    vi.spyOn(api.etfApi, 'getTradingFlow').mockResolvedValue({ data: mockTradingFlow })
    vi.spyOn(api.newsApi, 'getByTicker').mockResolvedValue({ data: mockNews })

    renderWithProviders(<ETFDetail />)

    await waitFor(() => {
      expect(screen.getByText('ACE 2차전지PLUS')).toBeInTheDocument()
    })

    // 날짜 범위 버튼 확인
    expect(screen.getByText('7일')).toBeInTheDocument()
    expect(screen.getByText('1개월')).toBeInTheDocument()
    expect(screen.getByText('3개월')).toBeInTheDocument()
    expect(screen.getByText('커스텀')).toBeInTheDocument()
  })
})
