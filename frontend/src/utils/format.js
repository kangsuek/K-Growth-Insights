import { COLORS } from '../constants'

/**
 * 숫자를 천 단위 콤마로 포맷팅
 * @param {number} value - 포맷팅할 숫자
 * @returns {string} - 포맷팅된 문자열
 */
export const formatNumber = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '-'
  return value.toLocaleString('ko-KR')
}

/**
 * 거래량을 K/M 단위로 포맷팅
 * CLAUDE.md의 천 단위 구분 기호 규칙의 의도적 예외 — 거래량은 자릿수가 커서 축약이 더 읽기 쉽다.
 * @param {number} value - 거래량
 * @returns {string} - 포맷팅된 문자열
 */
export const formatVolume = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '-'

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toString()
}

/**
 * 가격을 포맷팅 (소수점 2자리, 천 단위 콤마)
 * @param {number} value - 가격
 * @returns {string} - 포맷팅된 문자열
 */
export const formatPrice = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '-'
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

/**
 * 등락률을 포맷팅
 * @param {number} value - 등락률 (%)
 * @returns {string} - 포맷팅된 문자열
 */
export const formatPercent = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '-'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/**
 * 등락률 색상 클래스 반환
 * @param {number} value - 등락률
 * @returns {string} - Tailwind CSS 색상 클래스
 */
export const getPriceChangeColor = (value) => {
  if (value === null || value === undefined || isNaN(value)) return 'text-gray-500 dark:text-gray-400'
  if (value > 0) return 'text-red-600 dark:text-red-400'
  if (value < 0) return 'text-blue-600 dark:text-blue-400'
  return 'text-gray-500 dark:text-gray-400'
}

/**
 * 등락률 색상 hex 값 반환 (차트용)
 * @param {number} value - 등락률
 * @returns {string} - Hex 색상 값
 */
export const getPriceChangeColorHex = (value) => {
  if (value === null || value === undefined || isNaN(value)) return COLORS.PRICE_NEUTRAL
  if (value > 0) return COLORS.PRICE_UP
  if (value < 0) return COLORS.PRICE_DOWN
  return COLORS.PRICE_NEUTRAL
}

/**
 * 금액을 억 원 단위로 포맷팅
 * @param {number} value - 금액 (원)
 * @returns {string} - 포맷팅된 문자열
 */
export const formatBillionWon = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '-'
  const billions = value / 100000000
  return `${billions.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}억`
}

/**
 * 순매수/순매도 포맷팅
 * @param {number} value - 순매수 금액 (원)
 * @returns {string} - 포맷팅된 문자열 (순매수 +XX억 / 순매도 -XX억)
 */
export const formatNetBuying = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '-'
  const billions = value / 100000000
  const sign = value > 0 ? '+' : ''
  const label = value > 0 ? '순매수' : '순매도'
  return `${label} ${sign}${billions.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}억`
}

/**
 * 순매수/순매도 색상 반환
 * @param {number} value - 순매수 금액
 * @returns {string} - Hex 색상 값
 */
export const getNetBuyingColor = (value) => {
  if (value === null || value === undefined || isNaN(value)) return COLORS.PRICE_NEUTRAL
  if (value > 0) return COLORS.NET_BUYING
  if (value < 0) return COLORS.NET_SELLING
  return COLORS.PRICE_NEUTRAL
}

/**
 * 자동 갱신 주기(ms)를 사람이 읽는 텍스트로 변환한다.
 *
 * 설정 화면은 "10분", 대시보드는 "600초"로 서로 다르게 표기하던 것을 한 곳으로 모은다.
 *
 * @param {number} ms - 갱신 주기(밀리초)
 * @returns {string} - '30초' / '1분' / '10분'
 */
export const formatRefreshInterval = (ms) => {
  if (!ms || ms < 1000) return '-'
  const seconds = ms / 1000
  return seconds < 60 ? `${seconds}초` : `${seconds / 60}분`
}
