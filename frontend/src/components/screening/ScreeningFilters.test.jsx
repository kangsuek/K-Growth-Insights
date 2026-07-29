import { describe, it, expect } from 'vitest'
import { formatDataFreshness } from './ScreeningFilters'

// toLocaleString('ko-KR') 결과를 그대로 비교하지 않고, 문구 구조와 포함 여부만 본다.
describe('formatDataFreshness', () => {
  it('시세·지표 수집 시각이 같으면 한 줄로 합친다', () => {
    const text = formatDataFreshness('2026-07-26T19:10:25+09:00', '2026-07-26T19:11:00+09:00')

    expect(text).toMatch(/^데이터 갱신: /)
    expect(text).not.toContain('시세')
    expect(text).not.toContain('지표')
  })

  it('시각이 1분 넘게 다르면 시세와 지표를 나눠 적는다', () => {
    const text = formatDataFreshness('2026-07-28T10:00:00+09:00', '2026-07-26T19:11:00+09:00')

    expect(text).toContain('시세')
    expect(text).toContain('지표')
    // 오래된 지표 쪽 날짜가 문구에 남아야 어느 쪽이 밀렸는지 보인다
    expect(text).toContain('7. 26.')
    expect(text).toContain('7. 28.')
  })

  it('한쪽만 있으면 그 시각만 보여준다', () => {
    expect(formatDataFreshness(null, '2026-07-26T19:11:00+09:00')).toMatch(/^데이터 갱신: /)
    expect(formatDataFreshness('2026-07-26T19:10:00+09:00', null)).toMatch(/^데이터 갱신: /)
  })

  it('둘 다 없으면 null', () => {
    expect(formatDataFreshness(null, null)).toBeNull()
    expect(formatDataFreshness(undefined, undefined)).toBeNull()
  })
})
