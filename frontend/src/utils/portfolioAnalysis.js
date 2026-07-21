/**
 * 포트폴리오 분석 리포트 유틸리티
 *
 * 포트폴리오 데이터를 기반으로 진단, 관찰 종목 동향, 조정 제안,
 * 보유 종목 건강 점검을 자동 생성하는 순수 함수 모음.
 */

/**
 * 포트폴리오 진단
 * @param {Array<{ticker, name, theme, value, percent}>} allocation
 * @param {Array<{ticker, name, investment, valuation, profitLoss, returnPct, contribution}>} contributions
 * @param {{totalInvestment, totalValuation, totalProfitLoss, totalReturnPct}} summary
 */
export function diagnosePortfolio(allocation, contributions, summary) {
  const concentrationDetails = []

  // 단일 종목 집중도 (>40%)
  for (const item of allocation) {
    if (item.percent > 40) {
      concentrationDetails.push({
        type: 'holding',
        name: item.name,
        percent: item.percent,
        threshold: 40,
        message: `${item.name}이(가) 포트폴리오의 ${item.percent.toFixed(1)}%를 차지 (권장 상한 40%)`,
      })
    }
  }

  // 섹터(theme) 집중도 (>60%)
  const themeMap = new Map()
  for (const item of allocation) {
    const theme = item.theme || '미분류'
    const existing = themeMap.get(theme) || { percent: 0, names: [] }
    existing.percent += item.percent
    existing.names.push(item.name)
    themeMap.set(theme, existing)
  }
  for (const [theme, data] of themeMap) {
    if (data.percent > 60) {
      concentrationDetails.push({
        type: 'theme',
        name: theme,
        percent: data.percent,
        threshold: 60,
        message: `${theme} 섹터 비중 ${data.percent.toFixed(1)}% (${data.names.join(', ')})`,
      })
    }
  }

  // 최대 기여자 / 최대 드래그
  let biggestContributor = null
  let biggestDrag = null
  for (const c of contributions) {
    if (!biggestContributor || c.contribution > biggestContributor.contribution) {
      biggestContributor = { name: c.name, contribution: c.contribution, returnPct: c.returnPct }
    }
    if (!biggestDrag || c.contribution < biggestDrag.contribution) {
      biggestDrag = { name: c.name, contribution: c.contribution, returnPct: c.returnPct }
    }
  }

  const status = summary.totalReturnPct > 0.5 ? 'profit' : summary.totalReturnPct < -0.5 ? 'loss' : 'breakeven'

  return {
    concentrationRisk: {
      hasRisk: concentrationDetails.length > 0,
      details: concentrationDetails,
    },
    overallHealth: {
      totalReturnPct: summary.totalReturnPct,
      status,
      biggestContributor,
      biggestDrag: biggestDrag?.contribution < 0 ? biggestDrag : null,
    },
  }
}

/**
 * 관찰 종목 동향 분석
 * @param {Array} trackingETFs
 * @param {Object} batchSummary
 */
export function analyzeWatchedStocks(trackingETFs, batchSummary) {
  if (!trackingETFs || trackingETFs.length === 0 || !batchSummary) return []

  return trackingETFs.map(etf => {
    const data = batchSummary[etf.ticker]
    const dailyChangePct = data?.latest_price?.daily_change_pct ?? null
    const weeklyReturn = data?.weekly_return ?? null
    const flow = data?.latest_trading_flow

    // 수급 방향 판단
    const foreignNet = flow?.foreign_net ?? 0
    const institutionalNet = flow?.institutional_net ?? 0
    const foreignBuy = foreignNet > 0
    const institutionalBuy = institutionalNet > 0

    let tradingFlowDirection = 'neutral'
    let tradingFlowSummary = '중립'
    if (foreignBuy && institutionalBuy) {
      tradingFlowDirection = 'both_buy'
      tradingFlowSummary = '외국인+기관 매수'
    } else if (foreignBuy) {
      tradingFlowDirection = 'foreign_buy'
      tradingFlowSummary = '외국인 매수'
    } else if (institutionalBuy) {
      tradingFlowDirection = 'institutional_buy'
      tradingFlowSummary = '기관 매수'
    } else if (foreignNet < 0 && institutionalNet < 0) {
      tradingFlowDirection = 'selling'
      tradingFlowSummary = '외국인+기관 매도'
    }

    // 모멘텀 분류
    let momentum = 'flat'
    if (weeklyReturn != null) {
      if (weeklyReturn > 3) momentum = 'strong_up'
      else if (weeklyReturn > 1) momentum = 'moderate_up'
      else if (weeklyReturn < -3) momentum = 'strong_down'
      else if (weeklyReturn < -1) momentum = 'moderate_down'
    }

    // 하이라이트 (강한 모멘텀 OR 외국인+기관 매수)
    const highlight = momentum === 'strong_up' || tradingFlowDirection === 'both_buy'

    // 평가 텍스트
    let assessment = '관망'
    if (momentum === 'strong_up' && (foreignBuy || institutionalBuy)) {
      assessment = '강한 모멘텀 + 외부 매수'
    } else if (momentum === 'strong_up') {
      assessment = '강한 상승 모멘텀'
    } else if (foreignBuy && institutionalBuy) {
      assessment = '외국인·기관 동시 매수'
    } else if (momentum === 'strong_down') {
      assessment = weeklyReturn < -5 ? '급락 주의' : '약세 전환'
    } else if (foreignBuy) {
      assessment = '외국인 매수 유입'
    } else if (momentum === 'moderate_up') {
      assessment = '완만한 상승세'
    } else if (momentum === 'moderate_down') {
      assessment = '소폭 약세'
    }

    return {
      ticker: etf.ticker,
      name: etf.name,
      theme: etf.theme || '미분류',
      latestPrice: data?.latest_price?.close_price ?? null,
      dailyChangePct,
      weeklyReturn,
      tradingFlowDirection,
      tradingFlowSummary,
      assessment,
      momentum,
      highlight,
    }
  }).sort((a, b) => (b.weeklyReturn ?? -999) - (a.weeklyReturn ?? -999))
}

/**
 * 포트폴리오 조정 제안 생성
 * @param {Array} allocation
 * @param {Array} contributions
 * @param {Array} watchedAnalysis - analyzeWatchedStocks 결과
 * @param {Object} batchSummary
 * @param {Array} investedETFs
 */
export function generateAdjustmentSuggestions(allocation, contributions, watchedAnalysis, batchSummary, investedETFs) {
  const suggestions = []

  // 1. 손절 경고 (수익률 <-10%)
  for (const c of contributions) {
    if (c.returnPct < -10) {
      suggestions.push({
        priority: 1,
        action: 'stop_loss',
        ticker: c.ticker,
        name: c.name,
        rationale: `수익률 ${c.returnPct.toFixed(1)}%로 손절 기준(-10%) 하회. 추가 하락 방지를 위해 정리 검토`,
        actionLabel: '손절 검토',
        severity: 'high',
      })
    }
  }

  // 2. 비중 축소 (단일 종목 >40%)
  for (const a of allocation) {
    if (a.percent > 40) {
      const c = contributions.find(x => x.ticker === a.ticker)
      const targetPct = 65
      suggestions.push({
        priority: 2,
        action: 'trim',
        ticker: a.ticker,
        name: a.name,
        rationale: `비중 ${a.percent.toFixed(1)}%로 과도한 집중. ${targetPct}% 이하로 분할 차익실현 고려${c && c.returnPct > 0 ? ` (현재 수익률 +${c.returnPct.toFixed(1)}%)` : ''}`,
        actionLabel: '비중 축소',
        severity: 'high',
      })
    }
  }

  // 3. 관찰 종목 중 강한 모멘텀 → 신규 편입 검토
  const strongWatched = watchedAnalysis.filter(w => w.highlight)
  for (const w of strongWatched) {
    // 기존 보유 종목의 테마와 다른 테마 우선
    const investedThemes = new Set(investedETFs.map(e => e.theme))
    const isDiversifying = !investedThemes.has(w.theme)
    suggestions.push({
      priority: 3,
      action: 'buy',
      ticker: w.ticker,
      name: w.name,
      rationale: `주간 ${w.weeklyReturn != null ? (w.weeklyReturn > 0 ? '+' : '') + w.weeklyReturn.toFixed(1) + '%' : '-'}, ${w.tradingFlowSummary}${isDiversifying ? ' — 섹터 분산 효과' : ''}`,
      actionLabel: '신규 편입 검토',
      severity: 'medium',
    })
  }

  // 4. 부진 종목 정리 (수익률 <-5% & 수급 부정적)
  for (const c of contributions) {
    if (c.returnPct >= -5 || c.returnPct < -10) continue // -10% 이하는 이미 손절 경고
    const flow = batchSummary[c.ticker]?.latest_trading_flow
    const foreignNet = flow?.foreign_net ?? 0
    const institutionalNet = flow?.institutional_net ?? 0
    if (foreignNet < 0 && institutionalNet < 0) {
      suggestions.push({
        priority: 4,
        action: 'trim',
        ticker: c.ticker,
        name: c.name,
        rationale: `수익률 ${c.returnPct.toFixed(1)}%, 외국인·기관 동반 매도 중. 추가 하락 리스크`,
        actionLabel: '비중 축소 검토',
        severity: 'medium',
      })
    }
  }

  // 5. 눌림목 매수 기회 (주간 <-3% but 외국인 매수)
  const dipBuy = watchedAnalysis.filter(w =>
    !w.highlight &&
    w.weeklyReturn != null && w.weeklyReturn < -3 &&
    (w.tradingFlowDirection === 'foreign_buy' || w.tradingFlowDirection === 'both_buy')
  )
  for (const w of dipBuy) {
    suggestions.push({
      priority: 5,
      action: 'buy',
      ticker: w.ticker,
      name: w.name,
      rationale: `주간 ${w.weeklyReturn.toFixed(1)}% 하락 중이나 ${w.tradingFlowSummary} — 눌림목 매수 기회 가능성`,
      actionLabel: '분할 매수 검토',
      severity: 'low',
    })
  }

  // 우선순위 정렬 후 최대 5개
  return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 5)
}

/**
 * 보유 종목 건강 점검
 * @param {Array} contributions
 * @param {Object} batchSummary
 * @param {Array} investedETFs
 */
export function checkHoldingsHealth(contributions, batchSummary, investedETFs) {
  if (!contributions || contributions.length === 0) return []

  return contributions.map(c => {
    const etf = investedETFs.find(e => e.ticker === c.ticker)
    const flow = batchSummary?.[c.ticker]?.latest_trading_flow

    // 수익 상태
    let returnStatus = 'profit'
    if (c.returnPct < -10) returnStatus = 'danger'
    else if (c.returnPct < -5) returnStatus = 'warning'
    else if (c.returnPct < 0) returnStatus = 'slight_loss'

    // 수급 신호
    const foreignNet = flow?.foreign_net ?? 0
    const institutionalNet = flow?.institutional_net ?? 0
    let tradingFlowSignal = 'neutral'
    if (foreignNet > 0 && institutionalNet > 0) tradingFlowSignal = 'positive'
    else if (foreignNet < 0 && institutionalNet < 0) tradingFlowSignal = 'negative'

    // 건강 메모
    const statusTexts = {
      profit: '수익 중',
      slight_loss: '소폭 손실',
      warning: '경고 구간',
      danger: '손절 검토 필요',
    }
    const flowTexts = {
      positive: '외국인·기관 매수',
      negative: '외국인·기관 매도',
      neutral: '수급 혼조',
    }
    const healthNote = `${statusTexts[returnStatus]}, ${flowTexts[tradingFlowSignal]}`

    return {
      ticker: c.ticker,
      name: c.name,
      theme: etf?.theme || '미분류',
      returnPct: c.returnPct,
      contribution: c.contribution,
      returnStatus,
      tradingFlowSignal,
      healthNote,
    }
  })
}

/**
 * 포트폴리오 분석 리포트 생성 (orchestrator)
 * @param {Object} params
 */
export function generatePortfolioReport({ investedETFs, trackingETFs, batchSummary, allocation, contributions, summary }) {
  const diagnosis = diagnosePortfolio(allocation, contributions, summary)
  const watchedStockAnalysis = analyzeWatchedStocks(trackingETFs, batchSummary)
  const adjustmentSuggestions = generateAdjustmentSuggestions(allocation, contributions, watchedStockAnalysis, batchSummary, investedETFs)
  const holdingsHealth = checkHoldingsHealth(contributions, batchSummary, investedETFs)

  return { diagnosis, watchedStockAnalysis, adjustmentSuggestions, holdingsHealth }
}
