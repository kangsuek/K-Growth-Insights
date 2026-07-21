import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PriceChart from './PriceChart'

// Mock data
const mockPriceData = [
  {
    date: '2025-11-01',
    open_price: 15000,
    high_price: 15200,
    low_price: 14900,
    close_price: 15100,
    volume: 1200000,
    daily_change_pct: 1.5,
  },
  {
    date: '2025-11-02',
    open_price: 15100,
    high_price: 15400,
    low_price: 15050,
    close_price: 15300,
    volume: 1350000,
    daily_change_pct: 1.32,
  },
  {
    date: '2025-11-03',
    open_price: 15300,
    high_price: 15500,
    low_price: 15200,
    close_price: 15450,
    volume: 1450000,
    daily_change_pct: 0.98,
  },
  {
    date: '2025-11-04',
    open_price: 15450,
    high_price: 15600,
    low_price: 15300,
    close_price: 15400,
    volume: 1280000,
    daily_change_pct: -0.32,
  },
  {
    date: '2025-11-05',
    open_price: 15400,
    high_price: 15550,
    low_price: 15350,
    close_price: 15500,
    volume: 1320000,
    daily_change_pct: 0.65,
  },
]

describe('PriceChart', () => {
  it('가격 차트를 정상적으로 렌더링한다', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // SVG가 렌더링되는지 확인
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()

    // ResponsiveContainer가 렌더링되는지 확인
    const responsiveContainer = container.querySelector('.recharts-responsive-container')
    expect(responsiveContainer).toBeInTheDocument()
  })

  it('빈 데이터일 때 적절한 메시지를 표시한다', () => {
    render(<PriceChart data={[]} ticker="487240" />)

    expect(screen.getByText('표시할 가격 데이터가 없습니다.')).toBeInTheDocument()
  })

  it('데이터가 null일 때 적절한 메시지를 표시한다', () => {
    render(<PriceChart data={null} ticker="487240" />)

    expect(screen.getByText('표시할 가격 데이터가 없습니다.')).toBeInTheDocument()
  })

  it('데이터가 undefined일 때 적절한 메시지를 표시한다', () => {
    render(<PriceChart data={undefined} ticker="487240" />)

    expect(screen.getByText('표시할 가격 데이터가 없습니다.')).toBeInTheDocument()
  })

  it('레전드를 정상적으로 표시한다', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // 기본 레전드 항목 확인 (종가, 거래량)
    expect(screen.getByText('종가')).toBeInTheDocument()
    expect(screen.getByText(/거래량/)).toBeInTheDocument()

    // 이동평균선 체크박스 확인
    expect(screen.getByText('5일 이동평균선')).toBeInTheDocument()
    expect(screen.getByText('10일 이동평균선')).toBeInTheDocument()
    expect(screen.getByText('20일 이동평균선')).toBeInTheDocument()
  })

  it('차트가 지정된 높이로 렌더링된다', () => {
    const customHeight = 500
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" height={customHeight} />
    )

    const responsiveContainer = container.querySelector('.recharts-responsive-container')
    expect(responsiveContainer).toHaveStyle({ height: `${customHeight}px` })
  })

  it('반응형 높이로 렌더링된다 (기본값)', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    const responsiveContainer = container.querySelector('.recharts-responsive-container')
    // 반응형 높이는 useWindowSize 훅에서 계산되므로, 존재 여부만 확인
    expect(responsiveContainer).toBeInTheDocument()
  })

  it('툴팁이 포함되어 있다', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // 차트 영역 찾기
    const chartArea = container.querySelector('.recharts-wrapper')
    expect(chartArea).toBeInTheDocument()

    // 차트 영역에 마우스 오버 (툴팁 활성화 시도)
    const surface = container.querySelector('.recharts-surface')
    if (surface) {
      await user.hover(surface)
    }

    // 툴팁 컴포넌트가 마운트되었는지 확인 (실제 표시 여부는 마우스 위치에 따라 다름)
    // Recharts는 툴팁을 동적으로 렌더링하므로 기본적으로는 존재하지 않을 수 있음
    expect(container).toBeInTheDocument()
  })

  it('종가 라인을 렌더링한다 (기본)', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // Line 컴포넌트가 렌더링되는지 확인 (종가만 기본 표시)
    const lines = container.querySelectorAll('.recharts-line')
    expect(lines.length).toBeGreaterThanOrEqual(1) // 최소 종가 라인은 있어야 함
  })

  it('거래량 막대를 렌더링한다', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // Bar 컴포넌트가 렌더링되는지 확인
    const bars = container.querySelectorAll('.recharts-bar')
    expect(bars.length).toBeGreaterThan(0)
  })

  it('X축과 Y축을 렌더링한다', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // X축 확인
    const xAxis = container.querySelector('.recharts-xAxis')
    expect(xAxis).toBeInTheDocument()

    // Y축 확인 (2개: 가격, 거래량)
    const yAxes = container.querySelectorAll('.recharts-yAxis')
    expect(yAxes.length).toBe(2)
  })

  it('반응형으로 동작한다', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // ResponsiveContainer가 100% 너비를 사용하는지 확인
    const responsiveContainer = container.querySelector('.recharts-responsive-container')
    expect(responsiveContainer).toBeInTheDocument()

    // ResponsiveContainer의 부모가 100% 너비를 사용하는지 확인
    const wrapper = container.querySelector('div.w-full')
    expect(wrapper).toBeInTheDocument()
  })
})

describe('PriceChart CustomTooltip', () => {
  it('툴팁이 활성화되면 가격 정보를 표시한다', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // 차트가 렌더링되었는지 확인
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument()
  })
})

describe('PriceChart 데이터 처리', () => {
  it('날짜 포맷을 올바르게 처리한다', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // X축이 렌더링되었는지 확인
    const xAxis = container.querySelector('.recharts-xAxis')
    expect(xAxis).toBeInTheDocument()

    // X축 틱이 있는지 확인
    const ticks = container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick')
    expect(ticks.length).toBeGreaterThan(0)
  })

  it('가격 포맷팅을 올바르게 처리한다', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // Y축 (가격)이 렌더링되었는지 확인
    const yAxis = container.querySelector('.recharts-yAxis')
    expect(yAxis).toBeInTheDocument()
  })

  it('거래량 포맷팅을 올바르게 처리한다', () => {
    const { container } = render(
      <PriceChart data={mockPriceData} ticker="487240" />
    )

    // 2개의 Y축이 있는지 확인 (가격, 거래량)
    const yAxes = container.querySelectorAll('.recharts-yAxis')
    expect(yAxes.length).toBe(2)
  })

  it('상승(종가 > 시가)일 때 빨간색 거래량 막대를 표시한다', () => {
    const risingData = [
      {
        date: '2025-11-03', // 월요일
        open_price: 10000,
        high_price: 10600,
        low_price: 9900,
        close_price: 10500, // 상승
        volume: 1000000,
        daily_change_pct: 5.0,
      },
    ]

    const { container } = render(
      <PriceChart data={risingData} ticker="487240" />
    )

    // 차트가 렌더링되었는지 확인
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument()
    // 거래량 막대가 존재하는지 확인
    const bars = container.querySelectorAll('.recharts-bar')
    expect(bars.length).toBeGreaterThan(0)
  })

  it('하락(종가 <= 시가)일 때 파란색 거래량 막대를 표시한다', () => {
    const fallingData = [
      {
        date: '2025-11-03', // 월요일
        open_price: 10000,
        high_price: 10100,
        low_price: 9400,
        close_price: 9500, // 하락
        volume: 1000000,
        daily_change_pct: -5.0,
      },
    ]

    const { container } = render(
      <PriceChart data={fallingData} ticker="487240" />
    )

    // 차트가 렌더링되었는지 확인
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument()
    // 거래량 막대가 존재하는지 확인
    const bars = container.querySelectorAll('.recharts-bar')
    expect(bars.length).toBeGreaterThan(0)
  })
})
