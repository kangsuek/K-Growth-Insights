/**
 * 공통 포맷팅 유틸리티 (스크리닝, 테마, 추천 등에서 공유)
 *
 * formatNumber/getChangeColor는 utils/format.js의 구현과 동일하므로 그쪽을
 * 단일 소스로 삼아 재노출한다 (두 파일이 각자 수정되며 어긋나는 것을 방지).
 * formatPercent만 화살표(▲/▼) 표기가 필요한 스크리닝류 화면 전용으로 별도 유지.
 */
import { formatNumber, getPriceChangeColor } from './format'

export { formatNumber }

export function formatPercent(val) {
  if (val == null) return '-'
  const arrow = val > 0 ? '▲' : val < 0 ? '▼' : ''
  const sign = val > 0 ? '+' : ''
  return `${arrow} ${sign}${val.toFixed(2)}%`
}

export const getChangeColor = getPriceChangeColor

export function formatSignedNumber(num) {
  if (num == null) return '-'
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toLocaleString('ko-KR')}`
}
