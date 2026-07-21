import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ChartSkeleton from './ChartSkeleton'

describe('ChartSkeleton', () => {
  it('기본 높이(400px)로 렌더링된다', () => {
    const { container } = render(<ChartSkeleton />)

    const skeleton = container.querySelector('[role="status"]')
    expect(skeleton).toBeInTheDocument()
    expect(skeleton).toHaveStyle({ height: '400px' })
  })

  it('커스텀 높이로 렌더링된다', () => {
    const { container } = render(<ChartSkeleton height={300} />)

    const skeleton = container.querySelector('[role="status"]')
    expect(skeleton).toHaveStyle({ height: '300px' })
  })

  it('접근성 라벨을 가진다', () => {
    render(<ChartSkeleton />)

    expect(screen.getByLabelText('차트 로딩 중')).toBeInTheDocument()
  })

  it('10개의 막대 그래프 요소를 렌더링한다', () => {
    const { container } = render(<ChartSkeleton />)

    // 막대 그래프 요소들 (가상 차트 바)
    const bars = container.querySelectorAll('.bg-gray-300.rounded-t')
    expect(bars).toHaveLength(10)
  })

  it('애니메이션 클래스를 가진다', () => {
    const { container } = render(<ChartSkeleton />)

    const skeleton = container.querySelector('[role="status"]')
    expect(skeleton).toHaveClass('animate-pulse')
  })

  it('X축 표현을 포함한다', () => {
    const { container } = render(<ChartSkeleton />)

    // X축을 나타내는 회색 막대
    const xAxis = container.querySelector('.h-4.bg-gray-300.rounded.w-full')
    expect(xAxis).toBeInTheDocument()
  })

  it('여러 높이로 렌더링할 수 있다', () => {
    const heights = [200, 300, 400, 500]

    heights.forEach(height => {
      const { container } = render(<ChartSkeleton height={height} />)
      const skeleton = container.querySelector('[role="status"]')
      expect(skeleton).toHaveStyle({ height: `${height}px` })
    })
  })
})
