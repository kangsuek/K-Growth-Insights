import { describe, it, expect } from 'vitest'
import { calculateSupportResistance } from './technicalIndicators'

// 최신순(DESC) 시세. 07-23은 당일(진행 중), 07-22가 직전 거래일.
const prices = [
  { date: '2026-07-23', open_price: 130, high_price: 140, low_price: 120, close_price: 132, volume: 10 },
  { date: '2026-07-22', open_price: 110, high_price: 130, low_price: 100, close_price: 120, volume: 10 },
  { date: '2026-07-21', open_price: 100, high_price: 106, low_price: 94, close_price: 100, volume: 10 },
  { date: '2026-07-20', open_price: 98, high_price: 102, low_price: 92, close_price: 98, volume: 10 },
  { date: '2026-07-17', open_price: 96, high_price: 100, low_price: 90, close_price: 96, volume: 10 },
]

describe('calculateSupportResistance', () => {
  it('기본은 배열의 두 번째 행(전일)으로 피봇을 계산한다', () => {
    const { pivot } = calculateSupportResistance(prices)
    // 07-22: (130 + 100 + 120) / 3
    expect(pivot.pp).toBeCloseTo(350 / 3)
  })

  it('기준일 인덱스를 주면 그 날짜의 고·저·종가로 피봇을 계산한다', () => {
    // 당일 일별 시세가 아직 없어 07-21이 기준일이 되는 상황(인덱스 2)
    const { pivot } = calculateSupportResistance(prices, 2)
    // 07-21: (106 + 94 + 100) / 3
    expect(pivot.pp).toBeCloseTo(300 / 3)
    expect(pivot.r1).toBeCloseTo(2 * 100 - 94)
    expect(pivot.s1).toBeCloseTo(2 * 100 - 106)
  })

  it('기준일 인덱스가 범위를 벗어나면 기본 동작(두 번째 행)으로 되돌아간다', () => {
    const { pivot } = calculateSupportResistance(prices, 99)
    expect(pivot.pp).toBeCloseTo(350 / 3)
  })
})
