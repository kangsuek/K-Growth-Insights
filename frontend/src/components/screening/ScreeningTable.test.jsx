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
  it('전년말 기준일은 감추고, 연중 상장 기준일만 표시한다', () => {
    const year = new Date().getFullYear()
    renderWithProviders(
      <ScreeningTable
        items={[
          { ...baseItem, ticker: '069500', name: '정상종목', ytd_base_date: `${year - 1}-12-30` },
          { ...baseItem, ticker: '0221V0', name: '신규상장', ytd_base_date: `${year}-07-21` },
        ]}
        total={2} page={1} pageSize={20}
        sortBy="weekly_return" sortDir="desc" onSort={() => {}} onPageChange={() => {}}
      />
    )

    const normalRow = screen.getByText('정상종목').closest('tr')
    const julRow = screen.getByText('신규상장').closest('tr')

    expect(within(normalRow).queryByText('12-30 ~')).not.toBeInTheDocument()
    expect(within(julRow).getByText('07-21 ~')).toBeInTheDocument()
  })
})

describe('isLateYtdBase', () => {
  it('전년도 기준일이면 false — 네이버와 같은 정상 기준이라 덧붙이지 않는다', () => {
    // 하이픈·점 표기 모두 인식해야 한다 (백엔드는 하이픈으로 저장한다)
    expect(isLateYtdBase('2025-12-30', 2026)).toBe(false)
    expect(isLateYtdBase('2025.12.30', 2026)).toBe(false)
  })

  it('올해 기준일이면 true — 연중 상장 등은 기준일을 보여준다', () => {
    expect(isLateYtdBase('2026-01-02', 2026)).toBe(true)
    expect(isLateYtdBase('2026.03.15', 2026)).toBe(true)
    expect(isLateYtdBase('2026-07-21', 2026)).toBe(true)
  })

  it('기준일이 없으면 false', () => {
    expect(isLateYtdBase(null, 2026)).toBe(false)
    expect(isLateYtdBase(undefined, 2026)).toBe(false)
    expect(isLateYtdBase('', 2026)).toBe(false)
  })
})
