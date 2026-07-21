// 사용자에게 보여지는 모든 숫자는 천 단위 구분 기호를 사용한다.

// 정수/실수를 천 단위 구분 기호로 표시 (예: 1234567 -> "1,234,567")
export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return Number(value).toLocaleString('ko-KR')
}

// 가격 표시 (예: 260000 -> "260,000원")
export function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return `${Number(value).toLocaleString('ko-KR')}원`
}

// 순매수 수량 등 부호가 의미 있는 값 (예: 1129083 -> "+1,129,083")
export function formatSigned(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  const n = Number(value)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toLocaleString('ko-KR')}`
}

// 등락률 표시 (예: 6.56 -> "+6.56%")
export function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  const n = Number(value)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

// 등락 색상: 상승은 빨강, 하락은 파랑 (한국 시장 관례)
export function changeColor(value) {
  if (value > 0) return '#d60000'
  if (value < 0) return '#0051c7'
  return '#666'
}
