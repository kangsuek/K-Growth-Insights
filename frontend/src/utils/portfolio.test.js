import { describe, it, expect } from 'vitest'
import {
  classifyETFs,
  calculatePortfolioSummary,
  calculateAllocation,
  calculateDailyPortfolioTrend,
  calculateContribution,
} from './portfolio'

/** batch-summary 형태: prices는 최신순(DESC) */
const summaryOf = (map) =>
  Object.fromEntries(
    Object.entries(map).map(([ticker, rows]) => [ticker, { prices: rows }]),
  )

describe('classifyETFs', () => {
  it('매입가와 수량이 모두 있으면 투자 종목으로 분류한다', () => {
    const { invested, trackingOnly } = classifyETFs([
      { ticker: 'A', purchase_price: 100, quantity: 10 },
      { ticker: 'B', purchase_price: null, quantity: null },
      { ticker: 'C', purchase_price: 100, quantity: 0 },
    ])

    expect(invested.map((e) => e.ticker)).toEqual(['A'])
    expect(trackingOnly.map((e) => e.ticker)).toEqual(['B', 'C'])
  })
})

describe('calculatePortfolioSummary', () => {
  it('투자금·평가액·손익·수익률을 계산한다', () => {
    const etfs = [{ ticker: '322000', purchase_price: 165200, quantity: 535 }]
    const summary = summaryOf({ '322000': [{ date: '2026-07-24', close_price: 164000 }] })

    const r = calculatePortfolioSummary(etfs, summary)

    expect(r.totalInvestment).toBe(165200 * 535)
    expect(r.totalValuation).toBe(164000 * 535)
    expect(r.totalProfitLoss).toBe(164000 * 535 - 165200 * 535)
    expect(r.totalReturnPct).toBeCloseTo(-0.7264, 3)
  })

  it('시세가 없는 종목은 투자금·평가액에서 함께 제외한다(수익률 왜곡 방지)', () => {
    const etfs = [
      { ticker: 'A', purchase_price: 100, quantity: 10 },
      { ticker: 'B', purchase_price: 100, quantity: 10 },
    ]
    const summary = summaryOf({ A: [{ date: '2026-07-24', close_price: 120 }], B: [] })

    const r = calculatePortfolioSummary(etfs, summary)

    expect(r.totalInvestment).toBe(1000)
    expect(r.totalValuation).toBe(1200)
    expect(r.totalReturnPct).toBeCloseTo(20, 6)
  })
})

describe('calculateAllocation', () => {
  it('평가액 기준 비중을 계산하고 합이 100%가 된다', () => {
    const etfs = [
      { ticker: 'A', name: 'A', purchase_price: 100, quantity: 10 },
      { ticker: 'B', name: 'B', purchase_price: 100, quantity: 10 },
    ]
    const summary = summaryOf({
      A: [{ date: '2026-07-24', close_price: 300 }],
      B: [{ date: '2026-07-24', close_price: 100 }],
    })

    const rows = calculateAllocation(etfs, summary)

    expect(rows.map((r) => r.percent)).toEqual([75, 25])
    expect(rows.reduce((s, r) => s + r.percent, 0)).toBeCloseTo(100, 6)
  })
})

describe('calculateContribution', () => {
  it('기여도 합이 전체 수익률과 같다', () => {
    const etfs = [
      { ticker: 'A', name: 'A', purchase_price: 100, quantity: 10 },
      { ticker: 'B', name: 'B', purchase_price: 200, quantity: 5 },
    ]
    const summary = summaryOf({
      A: [{ date: '2026-07-24', close_price: 150 }],
      B: [{ date: '2026-07-24', close_price: 150 }],
    })
    const { totalInvestment, totalReturnPct } = calculatePortfolioSummary(etfs, summary)

    const rows = calculateContribution(etfs, summary, totalInvestment)

    expect(rows.reduce((s, r) => s + r.contribution, 0)).toBeCloseTo(totalReturnPct, 6)
    // 기여도 내림차순
    expect(rows[0].contribution).toBeGreaterThanOrEqual(rows[1].contribution)
  })
})

describe('calculateDailyPortfolioTrend', () => {
  it('모든 종목의 시세가 있는 날짜는 합산해 평가한다', () => {
    const etfs = [
      { ticker: 'A', purchase_price: 100, quantity: 10 },
      { ticker: 'B', purchase_price: 100, quantity: 10 },
    ]
    const summary = summaryOf({
      A: [{ date: '2026-07-02', close_price: 110 }, { date: '2026-07-01', close_price: 100 }],
      B: [{ date: '2026-07-02', close_price: 110 }, { date: '2026-07-01', close_price: 100 }],
    })

    const trend = calculateDailyPortfolioTrend(etfs, summary, 2000)

    expect(trend.map((t) => t.date)).toEqual(['2026-07-01', '2026-07-02'])
    expect(trend[0].portfolioValue).toBe(2000)
    expect(trend[0].returnPct).toBeCloseTo(0, 6)
    expect(trend[1].portfolioValue).toBe(2200)
    expect(trend[1].returnPct).toBeCloseTo(10, 6)
  })

  // 회귀 방지: 종목마다 시세 기간이 다르면(신규 상장 등) 일부 종목만 있는 날짜에
  // 그 종목 평가액만 합산돼, 포트폴리오 가치가 실제보다 작게 나오고 수익률이
  // 급락한 것처럼 보였다.
  it('일부 종목의 시세만 있는 날짜는 추이에서 제외한다', () => {
    const etfs = [
      { ticker: 'A', purchase_price: 100, quantity: 10 },
      { ticker: 'B', purchase_price: 100, quantity: 10 },
    ]
    const summary = summaryOf({
      // A는 3일, B는 마지막 1일만 (신규 상장 종목)
      A: [
        { date: '2026-07-03', close_price: 100 },
        { date: '2026-07-02', close_price: 100 },
        { date: '2026-07-01', close_price: 100 },
      ],
      B: [{ date: '2026-07-03', close_price: 100 }],
    })

    const trend = calculateDailyPortfolioTrend(etfs, summary, 2000)

    expect(trend.map((t) => t.date)).toEqual(['2026-07-03'])
    expect(trend[0].portfolioValue).toBe(2000)
    expect(trend[0].returnPct).toBeCloseTo(0, 6)
  })
})

describe('calculateDailyPortfolioTrend - 보유 기간 반영', () => {
  // 회귀 방지: 매수일 이전 구간까지 '수익률'로 그려, 어제 산 종목이 한 달 전에
  // -35%였던 것처럼 보였다.
  it('가장 늦은 매수일 이후만 추이에 넣는다', () => {
    const etfs = [
      { ticker: 'A', purchase_price: 100, quantity: 10, purchase_date: '2026-07-02' },
      { ticker: 'B', purchase_price: 100, quantity: 10, purchase_date: '2026-07-03' },
    ]
    const summary = summaryOf({
      A: [
        { date: '2026-07-04', close_price: 120 },
        { date: '2026-07-03', close_price: 110 },
        { date: '2026-07-02', close_price: 100 },
        { date: '2026-07-01', close_price: 50 },
      ],
      B: [
        { date: '2026-07-04', close_price: 120 },
        { date: '2026-07-03', close_price: 110 },
        { date: '2026-07-02', close_price: 100 },
        { date: '2026-07-01', close_price: 50 },
      ],
    })

    const trend = calculateDailyPortfolioTrend(etfs, summary, 2000)

    // 두 종목을 모두 보유한 07-03부터
    expect(trend.map((t) => t.date)).toEqual(['2026-07-03', '2026-07-04'])
    expect(trend[0].portfolioValue).toBe(2200)
  })

  it('매수일을 모르는 종목이 있으면 전 구간을 유지한다', () => {
    const etfs = [
      { ticker: 'A', purchase_price: 100, quantity: 10, purchase_date: '2026-07-02' },
      { ticker: 'B', purchase_price: 100, quantity: 10, purchase_date: null },
    ]
    const summary = summaryOf({
      A: [{ date: '2026-07-02', close_price: 100 }, { date: '2026-07-01', close_price: 100 }],
      B: [{ date: '2026-07-02', close_price: 100 }, { date: '2026-07-01', close_price: 100 }],
    })

    const trend = calculateDailyPortfolioTrend(etfs, summary, 2000)

    expect(trend.map((t) => t.date)).toEqual(['2026-07-01', '2026-07-02'])
  })

  it('매수일이 최신 거래일이면 결과가 1건이다(차트는 안내로 대체)', () => {
    const etfs = [{ ticker: 'A', purchase_price: 100, quantity: 10, purchase_date: '2026-07-03' }]
    const summary = summaryOf({
      A: [
        { date: '2026-07-03', close_price: 100 },
        { date: '2026-07-02', close_price: 60 },
        { date: '2026-07-01', close_price: 50 },
      ],
    })

    const trend = calculateDailyPortfolioTrend(etfs, summary, 1000)

    expect(trend).toHaveLength(1)
    expect(trend[0].date).toBe('2026-07-03')
    expect(trend[0].returnPct).toBeCloseTo(0, 6)
  })
})
