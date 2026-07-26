import { describe, it, expect } from 'vitest'
import { COLUMNS } from './ScreeningTable'
import { SORT_OPTIONS } from '../../pages/Screening'

/**
 * 정렬 select(SORT_OPTIONS)와 표 헤더로 정렬 가능한 컬럼(COLUMNS)은 같은 집합이어야 한다.
 *
 * 회귀 방지: 예전에는 SORT_OPTIONS에 monthly_return·ytd_return이 없어서, 표에서
 * '연간(YTD)' 헤더로 정렬하면 실제로는 YTD로 정렬되는데 select에는 그 값이 없어
 * 첫 옵션인 '주간수익률'이 선택된 것처럼 보였다(정렬 기준 표시가 실제와 어긋남).
 */
describe('종목 발굴 정렬 옵션', () => {
  const sortableColumnKeys = COLUMNS.filter((c) => c.sortable).map((c) => c.key)
  const sortOptionValues = SORT_OPTIONS.map((o) => o.value)

  it('표에서 정렬 가능한 모든 컬럼이 정렬 select에 있다', () => {
    const missing = sortableColumnKeys.filter((k) => !sortOptionValues.includes(k))
    expect(missing).toEqual([])
  })

  it('정렬 select에 표에 없는 컬럼을 넣지 않는다', () => {
    const extra = sortOptionValues.filter((v) => !sortableColumnKeys.includes(v))
    expect(extra).toEqual([])
  })

  it('정렬 옵션 값이 중복되지 않는다', () => {
    expect(new Set(sortOptionValues).size).toBe(sortOptionValues.length)
  })
})
