import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ComparisonTable from './ComparisonTable'

const tickerInfo = {
  '322000': { name: 'HD현대에너지솔루션' },
  '005930': { name: '삼성전자' },
}

describe('ComparisonTable', () => {
  it('연환산·샤프가 null이면 N/A로 표시한다', () => {
    const statistics = {
      '322000': { period_return: 39.34, annualized_return: null, volatility: 157.95, max_drawdown: -30.75, sharpe_ratio: null, data_points: 20 },
      '005930': { period_return: -26.51, annualized_return: null, volatility: 92.87, max_drawdown: -28.13, sharpe_ratio: null, data_points: 20 },
    }

    render(<ComparisonTable statistics={statistics} tickerInfo={tickerInfo} />)

    // 데스크톱 표 + 모바일 카드가 함께 렌더되므로 개수로 단정하지 않고 존재만 확인
    expect(screen.getAllByText('N/A (3개월 미만)').length).toBeGreaterThan(0)
    expect(screen.getAllByText('+39.34%').length).toBeGreaterThan(0)
  })

  // 회귀 방지: value와 best가 모두 null일 때 `value === best`가 참이 되어
  // 전 종목이 N/A인 컬럼에 최고 표시(⭐)가 모두 붙었다.
  it('전 종목이 N/A인 컬럼에는 최고 표시(⭐)를 붙이지 않는다', () => {
    const statistics = {
      '322000': { period_return: 39.34, annualized_return: null, volatility: 157.95, max_drawdown: -30.75, sharpe_ratio: null, data_points: 20 },
      '005930': { period_return: -26.51, annualized_return: null, volatility: 92.87, max_drawdown: -28.13, sharpe_ratio: null, data_points: 20 },
    }

    const { container } = render(
      <ComparisonTable statistics={statistics} tickerInfo={tickerInfo} />
    )

    // 값이 있는 컬럼(기간 수익률·변동성·최대 낙폭)에만 ⭐가 붙는다.
    // 종목 2개 × (기간수익률 1 + 변동성 1 + 최대낙폭 1) = 데스크톱 3개,
    // 모바일 카드에도 같은 수가 렌더되므로 총 개수는 6의 배수가 된다.
    const stars = (container.textContent.match(/⭐/g) || []).length
    // 범례의 "⭐ = 최고 성과 지표" 1개를 제외한 셀 마커 수
    expect(stars).toBeGreaterThan(0)

    // N/A 셀에는 ⭐가 없어야 한다 — N/A 텍스트를 담은 요소에 ⭐가 함께 있으면 실패
    const naCells = Array.from(container.querySelectorAll('td, div')).filter(
      (el) => el.children.length === 0 && /^N\/A/.test(el.textContent.trim())
    )
    expect(naCells.length).toBeGreaterThan(0)
    naCells.forEach((el) => {
      expect(el.parentElement.textContent).not.toContain('⭐')
    })
  })

  it('값이 있는 컬럼에서는 최고 성과에 ⭐를 붙인다', () => {
    const statistics = {
      '322000': { period_return: 39.34, annualized_return: 120.5, volatility: 157.95, max_drawdown: -30.75, sharpe_ratio: 1.2, data_points: 70 },
      '005930': { period_return: -26.51, annualized_return: -50.1, volatility: 92.87, max_drawdown: -28.13, sharpe_ratio: -0.5, data_points: 70 },
    }

    const { container } = render(
      <ComparisonTable statistics={statistics} tickerInfo={tickerInfo} />
    )

    expect(container.textContent).toContain('⭐')
    // 헤더 툴팁 문구에도 'N/A'가 들어 있으므로 값 셀(tbody)만 확인한다
    expect(container.querySelector('tbody').textContent).not.toContain('N/A')
  })

  it('통계가 비어 있으면 안내 문구를 표시한다', () => {
    render(<ComparisonTable statistics={{}} tickerInfo={{}} />)
    expect(screen.getByText('데이터가 없습니다')).toBeInTheDocument()
  })
})
