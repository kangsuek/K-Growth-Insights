import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import ScreeningFilters, { formatDataFreshness } from './ScreeningFilters'

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

describe('상승(+) 토글', () => {
  const renderFilters = (filters = {}) => {
    const changes = []
    renderWithProviders(
      <ScreeningFilters
        filters={{ market: 'ETF', ...filters }}
        onFilterChange={(partial) => changes.push(partial)}
        onReset={() => {}}
      />
    )
    return changes
  }

  it('등락률·주간·월간·연간 + 토글이 모두 있다', () => {
    renderFilters()
    for (const label of ['등락률 +', '주간 +', '월간 +', '연간 +']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    // 기존 수급 토글도 그대로 있어야 한다
    expect(screen.getByLabelText('외국인 순매수')).toBeInTheDocument()
    expect(screen.getByLabelText('기관 순매수')).toBeInTheDocument()
  })

  it('체크하면 해당 키를 true로 올린다', async () => {
    const user = userEvent.setup()
    const changes = renderFilters()

    await user.click(screen.getByLabelText('등락률 +'))
    expect(changes.at(-1)).toEqual({ daily_change_positive: true })
  })

  it('해제하면 undefined로 지운다 — false로 남기면 쿼리에 실린다', async () => {
    const user = userEvent.setup()
    const changes = renderFilters({ ytd_return_positive: true })

    const box = screen.getByLabelText('연간 +')
    expect(box).toBeChecked()

    await user.click(box)
    expect(changes.at(-1)).toEqual({ ytd_return_positive: undefined })
  })

  it("'모두 상승'은 네 조건을 한 번에 켠다 (수급 토글은 건드리지 않는다)", async () => {
    const user = userEvent.setup()
    const changes = renderFilters()

    await user.click(screen.getByRole('button', { name: '모두 상승' }))

    expect(changes.at(-1)).toEqual({
      daily_change_positive: true,
      weekly_return_positive: true,
      monthly_return_positive: true,
      ytd_return_positive: true,
    })
    expect(changes.at(-1)).not.toHaveProperty('foreign_net_positive')
  })
})
