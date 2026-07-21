/**
 * 포트폴리오 계산 유틸리티
 */

/**
 * ETF를 투자 종목/관찰 종목으로 분류
 * @param {Array} etfs - ETF 목록
 * @returns {{ invested: Array, trackingOnly: Array }}
 */
export function classifyETFs(etfs) {
  if (!etfs) return { invested: [], trackingOnly: [] }

  const invested = []
  const trackingOnly = []

  for (const etf of etfs) {
    if (etf.purchase_price && etf.quantity) {
      invested.push(etf)
    } else {
      trackingOnly.push(etf)
    }
  }

  return { invested, trackingOnly }
}

/**
 * 포트폴리오 요약 계산
 * @param {Array} investedETFs - 투자 종목 목록
 * @param {Object} batchSummary - { ticker: { prices: [...], ... } }
 * @returns {{ totalInvestment: number, totalValuation: number, totalProfitLoss: number, totalReturnPct: number }}
 */
export function calculatePortfolioSummary(investedETFs, batchSummary) {
  if (!investedETFs || investedETFs.length === 0 || !batchSummary) {
    return { totalInvestment: 0, totalValuation: 0, totalProfitLoss: 0, totalReturnPct: 0 }
  }

  let totalInvestment = 0
  let totalValuation = 0

  for (const etf of investedETFs) {
    const summary = batchSummary[etf.ticker]
    const latestPrice = summary?.prices?.[0]?.close_price
    if (!latestPrice) continue

    const investment = etf.purchase_price * etf.quantity
    const valuation = latestPrice * etf.quantity

    totalInvestment += investment
    totalValuation += valuation
  }

  const totalProfitLoss = totalValuation - totalInvestment
  const totalReturnPct = totalInvestment > 0 ? (totalProfitLoss / totalInvestment) * 100 : 0

  return { totalInvestment, totalValuation, totalProfitLoss, totalReturnPct }
}

/**
 * 종목별 비중 계산
 * @param {Array} investedETFs
 * @param {Object} batchSummary
 * @returns {Array<{ ticker, name, theme, value, percent }>}
 */
export function calculateAllocation(investedETFs, batchSummary) {
  if (!investedETFs || investedETFs.length === 0 || !batchSummary) return []

  const items = []
  let totalValue = 0

  for (const etf of investedETFs) {
    const summary = batchSummary[etf.ticker]
    const latestPrice = summary?.prices?.[0]?.close_price
    if (!latestPrice) continue

    const value = latestPrice * etf.quantity
    totalValue += value
    items.push({ ticker: etf.ticker, name: etf.name, theme: etf.theme, value })
  }

  return items.map(item => ({
    ...item,
    percent: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
  }))
}

/**
 * 일별 포트폴리오 추이 계산
 * @param {Array} investedETFs
 * @param {Object} batchSummary
 * @param {number} totalInvestment
 * @returns {Array<{ date, portfolioValue, returnPct }>}
 */
export function calculateDailyPortfolioTrend(investedETFs, batchSummary, totalInvestment) {
  if (!investedETFs || investedETFs.length === 0 || !batchSummary || totalInvestment <= 0) return []

  // 날짜별 포트폴리오 가치 집계
  const dateMap = new Map()

  for (const etf of investedETFs) {
    const summary = batchSummary[etf.ticker]
    const prices = summary?.prices
    if (!prices) continue

    for (const p of prices) {
      const existing = dateMap.get(p.date) || 0
      dateMap.set(p.date, existing + p.close_price * etf.quantity)
    }
  }

  // 날짜 오름차순 정렬
  const sorted = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, portfolioValue]) => ({
      date,
      portfolioValue,
      returnPct: ((portfolioValue - totalInvestment) / totalInvestment) * 100,
    }))

  return sorted
}

/**
 * 종목별 기여도 계산
 * @param {Array} investedETFs
 * @param {Object} batchSummary
 * @param {number} totalInvestment
 * @returns {Array<{ ticker, name, investment, valuation, profitLoss, returnPct, contribution }>}
 */
export function calculateContribution(investedETFs, batchSummary, totalInvestment) {
  if (!investedETFs || investedETFs.length === 0 || !batchSummary) return []

  const items = []

  for (const etf of investedETFs) {
    const summary = batchSummary[etf.ticker]
    const latestPrice = summary?.prices?.[0]?.close_price
    if (!latestPrice) continue

    const investment = etf.purchase_price * etf.quantity
    const valuation = latestPrice * etf.quantity
    const profitLoss = valuation - investment
    const returnPct = investment > 0 ? (profitLoss / investment) * 100 : 0
    const contribution = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0

    items.push({
      ticker: etf.ticker,
      name: etf.name,
      investment,
      valuation,
      profitLoss,
      returnPct,
      contribution,
    })
  }

  // 기여도 내림차순 정렬
  return items.sort((a, b) => b.contribution - a.contribution)
}
