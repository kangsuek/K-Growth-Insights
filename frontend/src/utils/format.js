// All user-facing numbers use thousands separators.

export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return Number(value).toLocaleString('ko-KR')
}

export function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return `${Number(value).toLocaleString('ko-KR')}원`
}

// Net buy quantities: signed with thousands separators.
export function formatSigned(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  const n = Number(value)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toLocaleString('ko-KR')}`
}

export function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  const n = Number(value)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

// Red for up, blue for down (Korean market convention).
export function changeColor(value) {
  if (value > 0) return '#d60000'
  if (value < 0) return '#0051c7'
  return '#666'
}
