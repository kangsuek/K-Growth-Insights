import { describe, it, expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import ScreeningTable, { isLateYtdBase } from './ScreeningTable'

const baseItem = {
  type: 'ETF', market: 'ETF', close_price: 10000, daily_change_pct: 1,
  volume: 1000, weekly_return: 1, monthly_return: 1, ytd_return: 5,
  foreign_net: 1, institutional_net: 1, is_registered: false,
}

describe('YTD 기준일 표기', () => {
  it('연초 기준일은 감추고, 늦은 기준일만 표시한다', () => {
    const year = new Date().getFullYear()
    renderWithProviders(
      <ScreeningTable
        items={[
          { ...baseItem, ticker: '069500', name: '연초종목', ytd_base_date: `${year}-01-02` },
          { ...baseItem, ticker: '0221V0', name: '신규상장', ytd_base_date: `${year}-07-21` },
        ]}
        total={2} page={1} pageSize={20}
        sortBy="weekly_return" sortDir="desc" onSort={() => {}} onPageChange={() => {}}
      />
    )

    const janRow = screen.getByText('연초종목').closest('tr')
    const julRow = screen.getByText('신규상장').closest('tr')

    expect(within(janRow).queryByText('01-02 ~')).not.toBeInTheDocument()
    expect(within(julRow).getByText('07-21 ~')).toBeInTheDocument()
  })
})

describe('isLateYtdBase', () => {
  it('연초(1월) 기준일이면 false — 기준일을 덧붙이지 않는다', () => {
    // 하이픈·점 표기 모두 연초로 인식해야 한다 (백엔드는 하이픈으로 저장한다)
    expect(isLateYtdBase('2026-01-02', 2026)).toBe(false)
    expect(isLateYtdBase('2026.01.02', 2026)).toBe(false)
    expect(isLateYtdBase('2026-01-31', 2026)).toBe(false)
  })

  it('1월이 아닌 기준일이면 true — 신규 상장 등은 기준일을 보여준다', () => {
    expect(isLateYtdBase('2026-02-03', 2026)).toBe(true)
    expect(isLateYtdBase('2026.03.15', 2026)).toBe(true)
  })

  it('기준일이 없으면 false', () => {
    expect(isLateYtdBase(null, 2026)).toBe(false)
    expect(isLateYtdBase(undefined, 2026)).toBe(false)
    expect(isLateYtdBase('', 2026)).toBe(false)
  })

  it('다른 해의 기준일이면 true', () => {
    expect(isLateYtdBase('2025-01-02', 2026)).toBe(true)
  })
})
