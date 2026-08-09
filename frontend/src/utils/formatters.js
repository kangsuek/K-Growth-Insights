/**
 * 공통 포맷팅 유틸리티 (스크리닝, 테마, 추천 등에서 공유)
 *
 * 구현은 utils/format.js를 단일 소스로 삼아 재노출한다 (두 파일이 각자 수정되며
 * 어긋나는 것을 방지). 예전에는 formatPercent만 화살표(▲/▼)를 붙여 따로 뒀는데,
 * 부호(+/-)와 색상이 이미 방향을 말해 줘 화살표를 뺐고 그래서 구현이 같아졌다.
 */
import { formatNumber, formatPercent, getPriceChangeColor } from './format'

export { formatNumber, formatPercent }

export const getChangeColor = getPriceChangeColor

export function formatSignedNumber(num) {
  if (num == null) return '-'
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toLocaleString('ko-KR')}`
}
