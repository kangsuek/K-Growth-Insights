/**
 * 기술지표 계산 유틸리티
 *
 * 입력: { date, close_price }[] (날짜 오름차순)
 */

/**
 * 지수이동평균(EMA) 계산
 * @param {number[]} data - 가격 배열
 * @param {number} period - 기간
 * @returns {number[]} EMA 배열 (입력과 동일 길이, 앞부분은 null)
 */
export function calculateEMA(data, period) {
  const ema = new Array(data.length).fill(null)
  if (data.length < period) return ema

  // 첫 EMA = SMA
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += data[i]
  }
  ema[period - 1] = sum / period

  const multiplier = 2 / (period + 1)
  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1]
  }

  return ema
}

/**
 * RSI 계산 (Wilder's smoothing)
 * @param {Array<{date: string, close_price: number}>} priceData - 오름차순
 * @param {number} period - 기간 (기본 14)
 * @returns {Array<{date: string, rsi: number|null}>}
 */
export function calculateRSI(priceData, period = 14) {
  if (!priceData || priceData.length < period + 1) return []

  const result = []
  const gains = []
  const losses = []

  // 일간 변화량 계산
  for (let i = 1; i < priceData.length; i++) {
    const change = priceData[i].close_price - priceData[i - 1].close_price
    gains.push(change > 0 ? change : 0)
    losses.push(change < 0 ? Math.abs(change) : 0)
  }

  // 첫 평균 이득/손실 (SMA)
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period

  // period까지는 null
  for (let i = 0; i < period; i++) {
    result.push({ date: priceData[i].date, rsi: null })
  }

  // 첫 RSI
  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss
  result.push({
    date: priceData[period].date,
    rsi: 100 - 100 / (1 + firstRS),
  })

  // Wilder's smoothing으로 이후 RSI 계산
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result.push({
      date: priceData[i + 1].date,
      rsi: 100 - 100 / (1 + rs),
    })
  }

  return result
}

/**
 * MACD 계산
 * @param {Array<{date: string, close_price: number}>} priceData - 오름차순
 * @param {number} fastPeriod - 단기 EMA (기본 12)
 * @param {number} slowPeriod - 장기 EMA (기본 26)
 * @param {number} signalPeriod - 시그널 EMA (기본 9)
 * @returns {Array<{date: string, macd: number|null, signal: number|null, histogram: number|null}>}
 */
export function calculateMACD(priceData, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!priceData || priceData.length < slowPeriod + signalPeriod) return []

  const prices = priceData.map(d => d.close_price)
  const fastEMA = calculateEMA(prices, fastPeriod)
  const slowEMA = calculateEMA(prices, slowPeriod)

  // MACD line = fast EMA - slow EMA
  const macdLine = prices.map((_, i) => {
    if (fastEMA[i] === null || slowEMA[i] === null) return null
    return fastEMA[i] - slowEMA[i]
  })

  // Signal line = EMA of MACD line
  const validMacd = macdLine.filter(v => v !== null)
  const signalEMA = calculateEMA(validMacd, signalPeriod)

  // 결과 매핑
  const result = []
  let validIndex = 0

  for (let i = 0; i < priceData.length; i++) {
    if (macdLine[i] === null) {
      result.push({ date: priceData[i].date, macd: null, signal: null, histogram: null })
    } else {
      const signal = signalEMA[validIndex]
      const histogram = signal !== null ? macdLine[i] - signal : null
      result.push({
        date: priceData[i].date,
        macd: macdLine[i],
        signal,
        histogram,
      })
      validIndex++
    }
  }

  return result
}

/**
 * 기술적 지지선/저항선 계산
 * 
 * 방법:
 * 1) 피봇 포인트(Pivot Point): 전일 고가/저가/종가 기반
 * 2) 이동평균선(SMA): 5일/20일/60일 이동평균
 * 3) 최근 가격대 고점/저점: 최근 N일간 주요 고점/저점
 *
 * @param {Array<{date: string, open_price: number, high_price: number, low_price: number, close_price: number, volume: number}>} priceData - 날짜 내림차순 (최신 → 과거)
 * @returns {{
 *   currentPrice: number,
 *   pivot: { pp: number, r1: number, r2: number, r3: number, s1: number, s2: number, s3: number },
 *   movingAverages: Array<{ label: string, value: number, period: number }>,
 *   recentLevels: { highestHigh: number, highestDate: string, lowestLow: number, lowestDate: string },
 *   supports: Array<{ price: number, label: string, type: string }>,
 *   resistances: Array<{ price: number, label: string, type: string }>,
 * } | null}
 */
export function calculateSupportResistance(priceData) {
  if (!priceData || priceData.length < 5) return null

  const currentPrice = priceData[0].close_price
  const yesterday = priceData[1] || priceData[0]

  // 1) 피봇 포인트 (Classic Pivot Point)
  const H = yesterday.high_price
  const L = yesterday.low_price
  const C = yesterday.close_price

  const PP = (H + L + C) / 3
  const R1 = 2 * PP - L
  const S1 = 2 * PP - H
  const R2 = PP + (H - L)
  const S2 = PP - (H - L)
  const R3 = H + 2 * (PP - L)
  const S3 = L - 2 * (H - PP)

  const pivot = { pp: PP, r1: R1, r2: R2, r3: R3, s1: S1, s2: S2, s3: S3 }

  // 2) 이동평균선 (SMA)
  const maList = [
    { label: '5일 이평선', period: 5 },
    { label: '20일 이평선', period: 20 },
    { label: '60일 이평선', period: 60 },
  ]

  const movingAverages = maList
    .filter(ma => priceData.length >= ma.period)
    .map(ma => {
      const sum = priceData.slice(0, ma.period).reduce((acc, d) => acc + d.close_price, 0)
      return { ...ma, value: sum / ma.period }
    })

  // 3) 최근 구간 최고가/최저가
  const recentDays = Math.min(priceData.length, 20)
  const recentSlice = priceData.slice(0, recentDays)
  let highestHigh = recentSlice[0]
  let lowestLow = recentSlice[0]
  for (const d of recentSlice) {
    if (d.high_price > highestHigh.high_price) highestHigh = d
    if (d.low_price < lowestLow.low_price) lowestLow = d
  }

  const recentLevels = {
    highestHigh: highestHigh.high_price,
    highestDate: highestHigh.date,
    lowestLow: lowestLow.low_price,
    lowestDate: lowestLow.date,
  }

  // 4) 지지선/저항선 통합 (현재가 기준으로 분류)
  const allLevels = [
    { price: PP, label: '피봇 포인트 (PP)', type: 'pivot' },
    { price: R1, label: '저항 1차 (R1)', type: 'pivot' },
    { price: R2, label: '저항 2차 (R2)', type: 'pivot' },
    { price: R3, label: '저항 3차 (R3)', type: 'pivot' },
    { price: S1, label: '지지 1차 (S1)', type: 'pivot' },
    { price: S2, label: '지지 2차 (S2)', type: 'pivot' },
    { price: S3, label: '지지 3차 (S3)', type: 'pivot' },
    ...movingAverages.map(ma => ({
      price: ma.value,
      label: ma.label,
      type: 'ma',
    })),
    { price: recentLevels.highestHigh, label: `최근 ${recentDays}일 최고가`, type: 'recent' },
    { price: recentLevels.lowestLow, label: `최근 ${recentDays}일 최저가`, type: 'recent' },
  ]

  // 현재가 위 = 저항선, 현재가 아래 = 지지선 (가까운 순 정렬)
  const resistances = allLevels
    .filter(l => l.price > currentPrice)
    .sort((a, b) => a.price - b.price) // 가까운 저항선 먼저

  const supports = allLevels
    .filter(l => l.price <= currentPrice)
    .sort((a, b) => b.price - a.price) // 가까운 지지선 먼저

  return {
    currentPrice,
    pivot,
    movingAverages,
    recentLevels,
    recentDays,
    supports,
    resistances,
  }
}

/**
 * RSI 기반 인사이트 텍스트 생성
 * @param {number} currentRSI
 * @returns {{type: string, text: string}|null}
 */
export function generateRSIInsight(currentRSI) {
  if (currentRSI == null) return null

  if (currentRSI >= 70) {
    return {
      type: 'warning',
      category: 'technical',
      priority: 1,
      text: `RSI ${currentRSI.toFixed(1)} - 과매수 구간 (매도 시그널)`,
    }
  }
  if (currentRSI <= 30) {
    return {
      type: 'positive',
      category: 'technical',
      priority: 1,
      text: `RSI ${currentRSI.toFixed(1)} - 과매도 구간 (매수 시그널)`,
    }
  }
  return null
}

/**
 * MACD 기반 인사이트 텍스트 생성
 * @param {Array} macdData - MACD 데이터 배열
 * @returns {{type: string, text: string}|null}
 */
export function generateMACDInsight(macdData) {
  if (!macdData || macdData.length < 2) return null

  const validData = macdData.filter(d => d.macd !== null && d.signal !== null)
  if (validData.length < 2) return null

  const last = validData[validData.length - 1]
  const prev = validData[validData.length - 2]

  // 골든크로스: MACD가 Signal을 상향 돌파
  if (prev.macd <= prev.signal && last.macd > last.signal) {
    return {
      type: 'positive',
      category: 'technical',
      priority: 1,
      text: 'MACD 골든크로스 발생 (상승 전환 시그널)',
    }
  }

  // 데드크로스: MACD가 Signal을 하향 돌파
  if (prev.macd >= prev.signal && last.macd < last.signal) {
    return {
      type: 'warning',
      category: 'technical',
      priority: 1,
      text: 'MACD 데드크로스 발생 (하락 전환 시그널)',
    }
  }

  return null
}
