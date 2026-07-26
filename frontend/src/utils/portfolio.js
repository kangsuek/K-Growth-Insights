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

  // 시세가 있는 종목만 대상으로 한다(totalInvestment도 같은 기준으로 계산된다).
  const eligible = investedETFs.filter((etf) => batchSummary[etf.ticker]?.prices?.length > 0)
  if (eligible.length === 0) return []

  // 모든 대상 종목에 시세가 있는 날짜(교집합)만 쓴다.
  // 일부 종목만 있는 날짜를 넣으면 그 종목 평가액만 합산돼 포트폴리오 가치가
  // 실제보다 작아지고, 신규 상장 종목이 하나 있으면 차트가 -50%에서 시작하는 것처럼
  // 보였다.
  const dateSets = eligible.map((etf) => new Set(batchSummary[etf.ticker].prices.map((p) => p.date)))
  let commonDates = [...dateSets[0]]
    .filter((date) => dateSets.every((set) => set.has(date)))
    .sort((a, b) => a.localeCompare(b))

  // 실제로 보유한 기간만 수익률로 본다. 매수일 이전 구간은 아직 사지도 않은 기간의
  // 손익이어서, 그대로 그리면 '어제 산 종목'이 한 달 전에 -35%였던 것처럼 보인다.
  // 보유 종목 전체의 매수일을 아는 경우에만 적용하고(하나라도 모르면 전 구간 유지),
  // 모두 보유하게 된 시점(가장 늦은 매수일) 이후로 자른다.
  const purchaseDates = eligible.map((etf) => etf.purchase_date).filter(Boolean)
  if (purchaseDates.length === eligible.length) {
    const heldFrom = purchaseDates.reduce((a, b) => (a > b ? a : b))
    commonDates = commonDates.filter((date) => date >= heldFrom)
  }

  // 종목별 {date: close_price} 조회용 맵
  const priceByTicker = new Map(
    eligible.map((etf) => [
      etf.ticker,
      new Map(batchSummary[etf.ticker].prices.map((p) => [p.date, p.close_price])),
    ]),
  )

  return commonDates.map((date) => {
    let portfolioValue = 0
    for (const etf of eligible) {
      portfolioValue += priceByTicker.get(etf.ticker).get(date) * etf.quantity
    }
    return {
      date,
      portfolioValue,
      returnPct: ((portfolioValue - totalInvestment) / totalInvestment) * 100,
    }
  })
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
