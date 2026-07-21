/**
 * 수익률 계산 유틸리티
 *
 * 백엔드 ComparisonService와 동일한 로직 사용
 * - 거래일 기준 계산 (데이터 포인트 개수)
 * - 복리 효과 반영
 */

/**
 * 기간 수익률 계산
 *
 * @param {Array} data - 가격 데이터 배열 (최신순 정렬)
 * @returns {number} 기간 수익률 (%)
 */
export function calculatePeriodReturn(data) {
  if (!data || data.length < 2) {
    return 0
  }

  // API는 데이터를 내림차순(최신 날짜가 먼저)으로 반환
  // data[0] = 최신 날짜, data[data.length - 1] = 가장 오래된 날짜
  const firstPrice = data[data.length - 1].close_price  // 시작 가격
  const lastPrice = data[0].close_price  // 종료 가격

  if (firstPrice === 0) {
    return 0
  }

  return ((lastPrice - firstPrice) / firstPrice) * 100
}

/**
 * 연환산 수익률 계산 (복리 효과 반영)
 *
 * 공식: ((1 + 기간수익률) ^ (365/거래일수) - 1) * 100
 *
 * 주의: 거래일 기준으로 계산 (달력 일수 아님)
 * - 거래일수 = 데이터 포인트 개수
 * - 주말, 공휴일 제외
 *
 * 개선: 3개월(약 60거래일) 미만 데이터는 연환산 표기 안 함
 *
 * @param {Array} data - 가격 데이터 배열 (최신순 정렬)
 * @returns {Object} { value: number, label: string, showAnnualized: boolean, note?: string }
 */
export function calculateAnnualizedReturn(data) {
  if (!data || data.length < 2) {
    return {
      value: 0,
      label: '기간 수익률',
      showAnnualized: false
    }
  }

  // 거래일수 = 데이터 포인트 개수
  // (백엔드 ComparisonService와 동일한 로직)
  const tradingDays = data.length

  if (tradingDays === 0) {
    return {
      value: 0,
      label: '기간 수익률',
      showAnnualized: false
    }
  }

  // 기간 수익률 (소수)
  const firstPrice = data[data.length - 1].close_price
  const lastPrice = data[0].close_price

  if (firstPrice === 0) {
    return {
      value: 0,
      label: '기간 수익률',
      showAnnualized: false
    }
  }

  const periodReturn = (lastPrice - firstPrice) / firstPrice
  const periodReturnPct = periodReturn * 100

  // 3개월 미만(약 60거래일)은 연환산 표기 안 함
  if (tradingDays < 60) {
    return {
      value: periodReturnPct,
      label: `${tradingDays}일 수익률`,
      showAnnualized: false
    }
  }

  // 연환산: (1 + 기간수익률) ^ (365/거래일수) - 1
  // 복리 효과를 반영한 정확한 연환산 계산
  const annualized = (Math.pow(1 + periodReturn, 365 / tradingDays) - 1) * 100

  return {
    value: annualized,
    label: '연환산 수익률',
    showAnnualized: true,
    note: '참고용'
  }
}

/**
 * 일간 변동성 계산 (표준편차)
 *
 * @param {Array} data - 가격 데이터 배열 (최신순 정렬)
 * @returns {number|null} 일간 변동성 (%)
 */
export function calculateVolatility(data) {
  if (!data || data.length < 2) return null

  // 일간 수익률 계산
  const dailyReturns = []
  for (let i = 0; i < data.length - 1; i++) {
    const today = data[i].close_price
    const yesterday = data[i + 1].close_price
    if (yesterday > 0) {
      dailyReturns.push((today - yesterday) / yesterday)
    }
  }

  if (dailyReturns.length === 0) return null

  // 표준편차 계산
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length
  const stdDev = Math.sqrt(variance) * 100 // 퍼센트로 변환

  return stdDev
}

/**
 * 연환산 변동성 계산
 *
 * @param {Array} data - 가격 데이터 배열 (최신순 정렬)
 * @returns {number|null} 연환산 변동성 (%)
 */
export function calculateAnnualizedVolatility(data) {
  const dailyVol = calculateVolatility(data)
  if (dailyVol === null) return null

  // 연환산: 일간 변동성 × √252 (연간 거래일)
  return dailyVol * Math.sqrt(252)
}

/**
 * 최대 낙폭 (Max Drawdown) 계산
 *
 * @param {Array} data - 가격 데이터 배열 (최신순 정렬)
 * @returns {Object|null} { value: MDD%, peak: 고점가격, trough: 저점가격 }
 */
export function calculateMaxDrawdown(data) {
  if (!data || data.length < 2) return null

  // 데이터는 최신순이므로 역순으로 처리 (시간순)
  const prices = [...data].reverse().map(d => d.close_price)

  let peak = prices[0]
  let maxDrawdown = 0
  let peakPrice = prices[0]
  let troughPrice = prices[0]

  for (let i = 0; i < prices.length; i++) {
    if (prices[i] > peak) {
      peak = prices[i]
    }

    const drawdown = (peak - prices[i]) / peak * 100
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
      peakPrice = peak
      troughPrice = prices[i]
    }
  }

  return {
    value: maxDrawdown,
    peak: peakPrice,
    trough: troughPrice
  }
}

/**
 * 매입 대비 수익률 계산
 *
 * @param {number} currentPrice - 현재가
 * @param {number} purchasePrice - 매입가
 * @returns {number|null} 매입 대비 수익률 (%)
 */
export function calculatePurchaseReturn(currentPrice, purchasePrice) {
  if (!purchasePrice || purchasePrice <= 0 || !currentPrice) {
    return null
  }
  return ((currentPrice - purchasePrice) / purchasePrice) * 100
}

/**
 * 통계 계산
 *
 * @param {Array} data - 가격 데이터 배열 (최신순 정렬)
 * @param {number} purchasePrice - 매입 가격 (선택사항)
 * @param {string} purchaseDate - 매입 날짜 (선택사항, YYYY-MM-DD 형식)
 * @returns {Object} 통계 객체
 */
export function calculateStats(data, purchasePrice = null, purchaseDate = null) {
  if (!data || data.length < 2) {
    return null
  }

  // 현재가 (가장 최신 종가)
  const currentPrice = data[0]?.close_price || 0

  // 기간 수익률: 항상 조회 기간의 시작가 → 종료가 기준
  const periodReturn = calculatePeriodReturn(data)

  // 매입 대비 수익률: 매입가가 있을 때만 계산
  const purchaseReturn = calculatePurchaseReturn(currentPrice, purchasePrice)

  // 가격 범위 (날짜 포함)
  const prices = data.map((d) => d.close_price)
  const highPrice = Math.max(...prices)
  const lowPrice = Math.min(...prices)
  const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length

  // 최고가/최저가 날짜 찾기
  const highPriceData = data.find((d) => d.close_price === highPrice)
  const lowPriceData = data.find((d) => d.close_price === lowPrice)

  const currentPriceDate = data[0]?.date

  // 리스크 지표 계산
  const dailyVolatility = calculateVolatility(data)
  const annualizedVolatility = calculateAnnualizedVolatility(data)
  const maxDrawdown = calculateMaxDrawdown(data)

  return {
    periodReturn,
    purchaseReturn,
    highPrice,
    lowPrice,
    avgPrice,
    currentPrice,
    currentPriceDate,
    highPriceDate: highPriceData?.date,
    lowPriceDate: lowPriceData?.date,
    tradingDays: data.length,
    // 리스크 지표
    dailyVolatility,
    annualizedVolatility,
    maxDrawdown,
  }
}
