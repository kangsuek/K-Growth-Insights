/**
 * 투자 인사이트 자동 생성 유틸리티
 *
 * 가격 데이터, 매매동향 데이터를 분석하여
 * 사용자에게 즉각적인 투자 인사이트를 제공합니다.
 */

import { calculateRSI, calculateMACD, generateRSIInsight, generateMACDInsight } from './technicalIndicators'

/**
 * 연속 매수/매도일 계산
 * @param {Array} data - 매매동향 데이터 (최신순)
 * @param {string} field - 분석할 필드 (foreign_net, institutional_net, individual_net)
 * @returns {Object} { buy: 연속매수일, sell: 연속매도일 }
 */
function countConsecutiveBuySell(data, field) {
  if (!data || data.length === 0) return { buy: 0, sell: 0 }

  let buyCount = 0
  let sellCount = 0

  // 첫 번째 값의 방향 확인
  const firstValue = data[0]?.[field] || 0

  if (firstValue > 0) {
    // 순매수 연속일 계산
    for (const item of data) {
      if (item[field] > 0) {
        buyCount++
      } else {
        break
      }
    }
  } else if (firstValue < 0) {
    // 순매도 연속일 계산
    for (const item of data) {
      if (item[field] < 0) {
        sellCount++
      } else {
        break
      }
    }
  }

  return { buy: buyCount, sell: sellCount }
}

/**
 * 이동평균 계산
 * @param {Array} data - 가격 데이터 (최신순)
 * @param {number} period - 이동평균 기간
 * @returns {number|null} 이동평균 값
 */
function calculateMovingAverage(data, period) {
  if (!data || data.length < period) return null

  const prices = data.slice(0, period).map(d => d.close_price)
  return prices.reduce((sum, p) => sum + p, 0) / period
}

/**
 * 일간 변동성 계산 (표준편차)
 * @param {Array} data - 가격 데이터 (최신순)
 * @returns {number|null} 일간 변동성 (%)
 */
function calculateDailyVolatility(data) {
  if (!data || data.length < 2) return null

  const dailyReturns = []
  for (let i = 0; i < data.length - 1; i++) {
    const today = data[i].close_price
    const yesterday = data[i + 1].close_price
    if (yesterday > 0) {
      dailyReturns.push((today - yesterday) / yesterday)
    }
  }

  if (dailyReturns.length === 0) return null

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length
  return Math.sqrt(variance) * 100
}

/**
 * 매매동향 기반 인사이트 생성
 * @param {Array} tradingFlowData - 매매동향 데이터 (최신순)
 * @returns {Array} 인사이트 배열
 */
export function generateTradingInsights(tradingFlowData) {
  if (!tradingFlowData || tradingFlowData.length === 0) return []

  const insights = []

  // 외국인 매매 패턴 분석
  const foreignPattern = countConsecutiveBuySell(tradingFlowData, 'foreign_net')
  if (foreignPattern.buy >= 3) {
    insights.push({
      type: 'positive',
      category: 'trading',
      priority: 1,
      text: `외국인 순매수 ${foreignPattern.buy}일 연속 지속 중`
    })
  } else if (foreignPattern.sell >= 3) {
    insights.push({
      type: 'warning',
      category: 'trading',
      priority: 1,
      text: `외국인 순매도 ${foreignPattern.sell}일 연속 지속 중`
    })
  }

  // 기관 매매 패턴 분석
  const institutionalPattern = countConsecutiveBuySell(tradingFlowData, 'institutional_net')
  if (institutionalPattern.buy >= 3) {
    insights.push({
      type: 'positive',
      category: 'trading',
      priority: 2,
      text: `기관 순매수 ${institutionalPattern.buy}일 연속 지속 중`
    })
  } else if (institutionalPattern.sell >= 3) {
    insights.push({
      type: 'warning',
      category: 'trading',
      priority: 2,
      text: `기관 순매도 ${institutionalPattern.sell}일 연속 지속 중`
    })
  }

  // 최근 3일 합산 분석 (외국인 + 기관)
  if (tradingFlowData.length >= 3) {
    const recent3Days = tradingFlowData.slice(0, 3)
    const totalForeign = recent3Days.reduce((sum, d) => sum + (d.foreign_net || 0), 0)
    const totalInstitutional = recent3Days.reduce((sum, d) => sum + (d.institutional_net || 0), 0)
    const combined = totalForeign + totalInstitutional

    if (combined > 0 && Math.abs(combined) > 1000000000) { // 10억 이상
      const amountText = (combined / 100000000).toFixed(0) // 억 단위
      insights.push({
        type: 'positive',
        category: 'trading',
        priority: 3,
        text: `최근 3일 외국인+기관 순매수 약 ${amountText}억원`
      })
    } else if (combined < 0 && Math.abs(combined) > 1000000000) {
      const amountText = (Math.abs(combined) / 100000000).toFixed(0)
      insights.push({
        type: 'warning',
        category: 'trading',
        priority: 3,
        text: `최근 3일 외국인+기관 순매도 약 ${amountText}억원`
      })
    }
  }

  return insights
}

/**
 * 가격 데이터 기반 인사이트 생성
 * @param {Array} pricesData - 가격 데이터 (최신순)
 * @returns {Array} 인사이트 배열
 */
export function generatePriceInsights(pricesData) {
  if (!pricesData || pricesData.length < 5) return []

  const insights = []
  const currentPrice = pricesData[0]?.close_price

  // 이동평균선 분석
  const ma5 = calculateMovingAverage(pricesData, 5)
  const ma20 = calculateMovingAverage(pricesData, 20)

  if (ma5 && ma20) {
    if (currentPrice > ma5 && ma5 > ma20) {
      insights.push({
        type: 'positive',
        category: 'trend',
        priority: 1,
        text: '단기 상승 추세 (5일선 > 20일선)'
      })
    } else if (currentPrice < ma5 && ma5 < ma20) {
      insights.push({
        type: 'warning',
        category: 'trend',
        priority: 1,
        text: '단기 하락 추세 (5일선 < 20일선)'
      })
    }

    // 골든크로스 / 데드크로스 감지 (최근 5일 내)
    if (pricesData.length >= 25) {
      const prevMa5 = calculateMovingAverage(pricesData.slice(5), 5)
      const prevMa20 = calculateMovingAverage(pricesData.slice(5), 20)

      if (prevMa5 && prevMa20) {
        if (prevMa5 < prevMa20 && ma5 > ma20) {
          insights.push({
            type: 'positive',
            category: 'trend',
            priority: 0,
            text: '최근 골든크로스 발생 (단기 상승 신호)'
          })
        } else if (prevMa5 > prevMa20 && ma5 < ma20) {
          insights.push({
            type: 'warning',
            category: 'trend',
            priority: 0,
            text: '최근 데드크로스 발생 (단기 하락 신호)'
          })
        }
      }
    }
  }

  // 변동성 분석
  const volatility = calculateDailyVolatility(pricesData)
  if (volatility !== null) {
    if (volatility > 3) {
      insights.push({
        type: 'warning',
        category: 'volatility',
        priority: 2,
        text: `변동성 확대 구간 (일간 ${volatility.toFixed(1)}%)`
      })
    } else if (volatility < 1) {
      insights.push({
        type: 'neutral',
        category: 'volatility',
        priority: 3,
        text: `낮은 변동성 유지 (일간 ${volatility.toFixed(1)}%)`
      })
    }
  }

  // 최고가/최저가 근접 분석
  if (pricesData.length >= 20) {
    const prices = pricesData.slice(0, 20).map(d => d.close_price)
    const highPrice = Math.max(...prices)
    const lowPrice = Math.min(...prices)
    const range = highPrice - lowPrice

    if (range > 0) {
      const positionFromHigh = (highPrice - currentPrice) / range * 100
      const positionFromLow = (currentPrice - lowPrice) / range * 100

      if (positionFromHigh < 5) {
        insights.push({
          type: 'positive',
          category: 'price',
          priority: 2,
          text: '20일 최고가 근접 구간'
        })
      } else if (positionFromLow < 5) {
        insights.push({
          type: 'warning',
          category: 'price',
          priority: 2,
          text: '20일 최저가 근접 구간'
        })
      }
    }
  }

  // 연속 상승/하락일 분석
  let consecutiveUp = 0
  let consecutiveDown = 0

  for (let i = 0; i < pricesData.length - 1 && i < 10; i++) {
    const todayChange = pricesData[i].daily_change_pct
    if (todayChange > 0) {
      if (consecutiveDown === 0) consecutiveUp++
      else break
    } else if (todayChange < 0) {
      if (consecutiveUp === 0) consecutiveDown++
      else break
    } else {
      break
    }
  }

  if (consecutiveUp >= 4) {
    insights.push({
      type: 'positive',
      category: 'momentum',
      priority: 1,
      text: `${consecutiveUp}일 연속 상승 중`
    })
  } else if (consecutiveDown >= 4) {
    insights.push({
      type: 'warning',
      category: 'momentum',
      priority: 1,
      text: `${consecutiveDown}일 연속 하락 중`
    })
  }

  // RSI 인사이트 (30건 이상)
  if (pricesData.length >= 30) {
    const ascending = [...pricesData].reverse()
    const rsiResult = calculateRSI(ascending, 14)
    const validRsi = rsiResult.filter(d => d.rsi !== null)
    if (validRsi.length > 0) {
      const rsiInsight = generateRSIInsight(validRsi[validRsi.length - 1].rsi)
      if (rsiInsight) insights.push(rsiInsight)
    }
  }

  // MACD 인사이트 (40건 이상)
  if (pricesData.length >= 40) {
    const ascending = [...pricesData].reverse()
    const macdResult = calculateMACD(ascending, 12, 26, 9)
    const macdInsight = generateMACDInsight(macdResult)
    if (macdInsight) insights.push(macdInsight)
  }

  return insights
}

/**
 * 리스크 인사이트 생성 (가격 + 매매동향 기반)
 * @param {Array} pricesData - 가격 데이터
 * @param {Array} tradingFlowData - 매매동향 데이터
 * @returns {Array} 리스크 인사이트 배열
 */
export function generateRiskInsights(pricesData, tradingFlowData) {
  const risks = []

  // 변동성 리스크
  const volatility = calculateDailyVolatility(pricesData)
  if (volatility !== null && volatility > 4) {
    risks.push({
      type: 'risk',
      text: `높은 변동성 주의 (일간 ${volatility.toFixed(1)}%)`
    })
  }

  // 외국인/기관 동반 매도 리스크
  if (tradingFlowData && tradingFlowData.length >= 3) {
    const recent3Days = tradingFlowData.slice(0, 3)
    const foreignSelling = recent3Days.every(d => d.foreign_net < 0)
    const institutionalSelling = recent3Days.every(d => d.institutional_net < 0)

    if (foreignSelling && institutionalSelling) {
      risks.push({
        type: 'risk',
        text: '외국인+기관 동반 순매도 3일 연속'
      })
    }
  }

  // 급락 경고 (최근 5일 내 -5% 이상 하락일 존재)
  if (pricesData && pricesData.length >= 5) {
    const recentDrops = pricesData.slice(0, 5).filter(d => d.daily_change_pct < -5)
    if (recentDrops.length > 0) {
      risks.push({
        type: 'risk',
        text: '최근 급락일 발생 (단기 변동성 주의)'
      })
    }
  }

  return risks
}

/**
 * 모든 인사이트 통합 및 정렬
 * @param {Array} pricesData - 가격 데이터
 * @param {Array} tradingFlowData - 매매동향 데이터
 * @returns {Object} { insights: 핵심포인트[], risks: 리스크[] }
 */
export function generateAllInsights(pricesData, tradingFlowData) {
  const priceInsights = generatePriceInsights(pricesData)
  const tradingInsights = generateTradingInsights(tradingFlowData)
  const riskInsights = generateRiskInsights(pricesData, tradingFlowData)

  // 모든 인사이트 합치고 우선순위로 정렬
  const allInsights = [...priceInsights, ...tradingInsights]
    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
    .slice(0, 4) // 최대 4개

  return {
    insights: allInsights,
    risks: riskInsights.slice(0, 3) // 최대 3개
  }
}
