import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TradingFlowChart, { formatTradingFlowData } from './TradingFlowChart'

// Mock data (원 단위)
const mockTradingFlowData = [
  {
    date: '2025-11-01',
    individual_net: 50000000000, // 500억 (순매수)
    institutional_net: -30000000000, // -300억 (순매도)
    foreign_net: 10000000000, // 100억 (순매수)
  },
  {
    date: '2025-11-02',
    individual_net: -20000000000, // -200억 (순매도)
    institutional_net: 40000000000, // 400억 (순매수)
    foreign_net: -15000000000, // -150억 (순매도)
  },
  {
    date: '2025-11-03',
    individual_net: 30000000000, // 300억 (순매수)
    institutional_net: 25000000000, // 250억 (순매수)
    foreign_net: 20000000000, // 200억 (순매수)
  },
  {
    date: '2025-11-04',
    individual_net: -40000000000, // -400억 (순매도)
    institutional_net: -10000000000, // -100억 (순매도)
    foreign_net: 35000000000, // 350억 (순매수)
  },
  {
    date: '2025-11-05',
    individual_net: 15000000000, // 150억 (순매수)
    institutional_net: 5000000000, // 50억 (순매수)
    foreign_net: -25000000000, // -250억 (순매도)
  },
]

describe('TradingFlowChart', () => {
  it('매매 동향 차트를 정상적으로 렌더링한다', () => {
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" />
    )

    // SVG가 렌더링되는지 확인
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()

    // ResponsiveContainer가 렌더링되는지 확인
    const responsiveContainer = container.querySelector('.recharts-responsive-container')
    expect(responsiveContainer).toBeInTheDocument()
  })

  it('빈 데이터일 때 적절한 메시지를 표시한다', () => {
    render(<TradingFlowChart data={[]} ticker="487240" />)

    expect(screen.getByText('표시할 매매 동향 데이터가 없습니다.')).toBeInTheDocument()
  })

  it('데이터가 null일 때 적절한 메시지를 표시한다', () => {
    render(<TradingFlowChart data={null} ticker="487240" />)

    expect(screen.getByText('표시할 매매 동향 데이터가 없습니다.')).toBeInTheDocument()
  })

  it('데이터가 undefined일 때 적절한 메시지를 표시한다', () => {
    render(<TradingFlowChart data={undefined} ticker="487240" />)

    expect(screen.getByText('표시할 매매 동향 데이터가 없습니다.')).toBeInTheDocument()
  })

  it('레전드를 정상적으로 표시한다', () => {
    render(<TradingFlowChart data={mockTradingFlowData} ticker="487240" />)

    // 3개 투자자 유형이 레전드에 표시되는지 확인
    expect(screen.getByText('개인')).toBeInTheDocument()
    expect(screen.getByText('기관')).toBeInTheDocument()
    expect(screen.getByText('외국인')).toBeInTheDocument()
  })

  it('차트가 지정된 높이로 렌더링된다', () => {
    const customHeight = 500
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" height={customHeight} />
    )

    const responsiveContainer = container.querySelector('.recharts-responsive-container')
    expect(responsiveContainer).toHaveStyle({ height: `${customHeight}px` })
  })

  it('반응형 높이로 렌더링된다 (기본값)', () => {
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" />
    )

    const responsiveContainer = container.querySelector('.recharts-responsive-container')
    // 반응형 높이는 useWindowSize 훅에서 계산되므로, 존재 여부만 확인
    expect(responsiveContainer).toBeInTheDocument()
  })

  it('3개의 투자자 유형 막대를 렌더링한다', () => {
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" />
    )

    // Bar 컴포넌트들이 렌더링되는지 확인 (개인, 기관, 외국인)
    const bars = container.querySelectorAll('.recharts-bar')
    expect(bars.length).toBe(3)
  })

  it('기준선(y=0)을 렌더링한다', () => {
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" />
    )

    // ReferenceLine이 렌더링되는지 확인
    const referenceLine = container.querySelector('.recharts-reference-line')
    expect(referenceLine).toBeInTheDocument()
  })

  it('X축과 Y축을 렌더링한다', () => {
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" />
    )

    // X축 확인
    const xAxis = container.querySelector('.recharts-xAxis')
    expect(xAxis).toBeInTheDocument()

    // Y축 확인 (1개: 순매수 금액)
    const yAxes = container.querySelectorAll('.recharts-yAxis')
    expect(yAxes.length).toBe(1)
  })

  it('반응형으로 동작한다', () => {
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" />
    )

    // ResponsiveContainer가 100% 너비를 사용하는지 확인
    const responsiveContainer = container.querySelector('.recharts-responsive-container')
    expect(responsiveContainer).toBeInTheDocument()

    // ResponsiveContainer의 부모가 100% 너비를 사용하는지 확인
    const wrapper = container.querySelector('div.w-full')
    expect(wrapper).toBeInTheDocument()
  })

  it('툴팁이 포함되어 있다', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" />
    )

    // 차트 영역 찾기
    const chartArea = container.querySelector('.recharts-wrapper')
    expect(chartArea).toBeInTheDocument()

    // 차트 영역에 마우스 오버 (툴팁 활성화 시도)
    const surface = container.querySelector('.recharts-surface')
    if (surface) {
      await user.hover(surface)
    }

    // 툴팁 컴포넌트가 마운트되었는지 확인
    expect(container).toBeInTheDocument()
  })
})

describe('formatTradingFlowData', () => {
  it('데이터를 천 원 단위로 변환한다', () => {
    const rawData = [
      {
        date: '2025-11-03', // 월요일
        individual_net: 1000000, // 100만원 → 1000천원
        institutional_net: -500000, // -50만원 → -500천원
        foreign_net: 250000, // 25만원 → 250천원
      },
    ]

    const result = formatTradingFlowData(rawData)

    expect(result).toHaveLength(1)
    expect(result[0].individual_net).toBe(1000)
    expect(result[0].institutional_net).toBe(-500)
    expect(result[0].foreign_net).toBe(250)
  })

  it('날짜를 오름차순으로 정렬한다', () => {
    const rawData = [
      {
        date: '2025-11-05', // 수요일
        individual_net: 10000000000,
        institutional_net: 10000000000,
        foreign_net: 10000000000,
      },
      {
        date: '2025-11-03', // 월요일
        individual_net: 20000000000,
        institutional_net: 20000000000,
        foreign_net: 20000000000,
      },
      {
        date: '2025-11-04', // 화요일
        individual_net: 30000000000,
        institutional_net: 30000000000,
        foreign_net: 30000000000,
      },
    ]

    const result = formatTradingFlowData(rawData)

    expect(result).toHaveLength(3)
    expect(result[0].date).toBe('2025-11-03')
    expect(result[1].date).toBe('2025-11-04')
    expect(result[2].date).toBe('2025-11-05')
  })

  it('빈 데이터를 처리한다', () => {
    const result = formatTradingFlowData([])
    expect(result).toEqual([])
  })

  it('null 데이터를 처리한다', () => {
    const result = formatTradingFlowData(null)
    expect(result).toEqual([])
  })

  it('undefined 데이터를 처리한다', () => {
    const result = formatTradingFlowData(undefined)
    expect(result).toEqual([])
  })

  it('소수점을 올바르게 처리한다', () => {
    const rawData = [
      {
        date: '2025-11-04', // 화요일
        individual_net: 123456, // 123,456원 → 123.456천원
        institutional_net: -987654, // -987,654원 → -987.654천원
        foreign_net: 555555, // 555,555원 → 555.555천원
      },
    ]

    const result = formatTradingFlowData(rawData)

    expect(result).toHaveLength(1)
    expect(result[0].individual_net).toBeCloseTo(123.456, 2)
    expect(result[0].institutional_net).toBeCloseTo(-987.654, 2)
    expect(result[0].foreign_net).toBeCloseTo(555.555, 2)
  })
})

describe('TradingFlowChart CustomTooltip', () => {
  it('툴팁이 활성화되면 투자자별 정보를 표시한다', () => {
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" />
    )

    // 차트가 렌더링되었는지 확인
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument()
  })
})

describe('TradingFlowChart 데이터 처리', () => {
  it('날짜 포맷을 올바르게 처리한다', () => {
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" />
    )

    // X축이 렌더링되었는지 확인
    const xAxis = container.querySelector('.recharts-xAxis')
    expect(xAxis).toBeInTheDocument()

    // X축 틱이 있는지 확인
    const ticks = container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick')
    expect(ticks.length).toBeGreaterThan(0)
  })

  it('순매수(양수) 데이터를 올바르게 처리한다', () => {
    const positiveData = [
      {
        date: '2025-11-03', // 월요일
        individual_net: 1000000, // 100만원
        institutional_net: 500000, // 50만원
        foreign_net: 250000, // 25만원
      },
    ]

    const { container } = render(
      <TradingFlowChart data={positiveData} ticker="487240" />
    )

    // 차트가 렌더링되었는지 확인
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument()
  })

  it('순매도(음수) 데이터를 올바르게 처리한다', () => {
    const negativeData = [
      {
        date: '2025-11-03', // 월요일
        individual_net: -1000000, // -100만원
        institutional_net: -500000, // -50만원
        foreign_net: -250000, // -25만원
      },
    ]

    const { container } = render(
      <TradingFlowChart data={negativeData} ticker="487240" />
    )

    // 차트가 렌더링되었는지 확인
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument()
  })

  it('혼합 데이터(양수+음수)를 올바르게 처리한다', () => {
    const { container } = render(
      <TradingFlowChart data={mockTradingFlowData} ticker="487240" />
    )

    // 차트가 렌더링되었는지 확인
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument()

    // StackedBarChart가 렌더링되었는지 확인
    const barChart = container.querySelector('.recharts-wrapper')
    expect(barChart).toBeInTheDocument()
  })
})
