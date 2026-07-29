import { describe, it, expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import PriceTable, { changePctFrom, buildPrevCloseMap, closeChangePct } from './PriceTable'

// Mock data
const mockPriceData = [
  {
    date: '2025-11-10',
    open_price: 15100,
    high_price: 15300,
    low_price: 15000,
    close_price: 15250,
    volume: 1250000,
    daily_change_pct: 2.34,
  },
  {
    date: '2025-11-09',
    open_price: 15000,
    high_price: 15200,
    low_price: 14900,
    close_price: 15100,
    volume: 1200000,
    daily_change_pct: 1.01,
  },
  {
    date: '2025-11-08',
    open_price: 14900,
    high_price: 15100,
    low_price: 14850,
    close_price: 15000,
    volume: 1100000,
    daily_change_pct: -0.50,
  },
  {
    date: '2025-11-07',
    open_price: 15050,
    high_price: 15150,
    low_price: 14800,
    close_price: 14950,
    volume: 1300000,
    daily_change_pct: -1.20,
  },
  {
    date: '2025-11-06',
    open_price: 15200,
    high_price: 15250,
    low_price: 15000,
    close_price: 15150,
    volume: 1150000,
    daily_change_pct: 0.67,
  },
]

describe('PriceTable', () => {
  describe('데이터 렌더링', () => {
    it('가격 데이터를 테이블 형태로 렌더링한다', () => {
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      // 헤더 확인 (데스크톱 테이블만)
      const desktopTable = container.querySelector('.hidden.md\\:block table')
      expect(desktopTable).toBeInTheDocument()
      expect(within(desktopTable).getByText('일자')).toBeInTheDocument()
      expect(within(desktopTable).getByText('시가')).toBeInTheDocument()
      expect(within(desktopTable).getByText('고가')).toBeInTheDocument()
      expect(within(desktopTable).getByText('저가')).toBeInTheDocument()
      expect(within(desktopTable).getByText('종가')).toBeInTheDocument()
      expect(within(desktopTable).getByText('거래량')).toBeInTheDocument()
      expect(within(desktopTable).getByText('등락률')).toBeInTheDocument()
    })

    it('날짜가 올바른 형식으로 표시된다', () => {
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const desktopTable = container.querySelector('.hidden.md\\:block table')
      expect(within(desktopTable).getByText('2025-11-10')).toBeInTheDocument()
      expect(within(desktopTable).getByText('2025-11-09')).toBeInTheDocument()
    })

    it('가격 데이터가 올바른 형식으로 표시된다', () => {
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const desktopTable = container.querySelector('.hidden.md\\:block table')
      // 숫자 포맷팅 확인 (천 단위 콤마)
      expect(within(desktopTable).getAllByText('15,100').length).toBeGreaterThan(0)
      expect(within(desktopTable).getAllByText('15,300').length).toBeGreaterThan(0)
    })

    it('등락률이 색상과 함께 표시된다', () => {
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      // 양수 등락률은 빨강색
      const positiveChangeElements = container.querySelectorAll('.text-red-600')
      expect(positiveChangeElements.length).toBeGreaterThan(0)

      // 음수 등락률은 파랑색
      const negativeChangeElements = container.querySelectorAll('.text-blue-600')
      expect(negativeChangeElements.length).toBeGreaterThan(0)
    })

    it('빈 데이터 배열일 때 메시지를 표시한다', () => {
      renderWithProviders(<PriceTable data={[]} />)

      expect(screen.getByText('가격 데이터가 없습니다')).toBeInTheDocument()
    })

    it('데이터가 없을 때 메시지를 표시한다', () => {
      renderWithProviders(<PriceTable />)

      expect(screen.getByText('가격 데이터가 없습니다')).toBeInTheDocument()
    })
  })

  describe('정렬 기능', () => {
    it('일자 기준으로 오름차순/내림차순 정렬이 가능하다', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const dateHeader = screen.getByText('일자').closest('th')

      // 기본은 내림차순 (최신 날짜가 먼저)
      const rows = screen.getAllByRole('row')
      const firstRow = rows[1] // 헤더를 제외한 첫 행
      expect(within(firstRow).getByText('2025-11-10')).toBeInTheDocument()

      // 클릭하여 오름차순으로 변경
      await user.click(dateHeader)

      const rowsAfterSort = screen.getAllByRole('row')
      const firstRowAfterSort = rowsAfterSort[1]
      expect(within(firstRowAfterSort).getByText('2025-11-06')).toBeInTheDocument()
    })

    it('종가 기준으로 정렬이 가능하다', async () => {
      const user = userEvent.setup()
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const desktopTable = container.querySelector('.hidden.md\\:block table')
      const closeHeader = within(desktopTable).getByText('종가').closest('th')

      // 종가 클릭 (오름차순)
      await user.click(closeHeader)

      const rows = within(desktopTable).getAllByRole('row')
      const firstRow = rows[1]
      // 가장 낮은 종가는 14,950
      expect(within(firstRow).getByText('14,950')).toBeInTheDocument()
    })

    it('거래량 기준으로 정렬이 가능하다', async () => {
      const user = userEvent.setup()
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const desktopTable = container.querySelector('.hidden.md\\:block table')
      const volumeHeader = within(desktopTable).getByText('거래량').closest('th')

      // 거래량 클릭 (오름차순)
      await user.click(volumeHeader)

      const rows = within(desktopTable).getAllByRole('row')
      const firstRow = rows[1]
      // 가장 낮은 거래량은 1,100,000 (1.1M)
      expect(within(firstRow).getByText('1.1M')).toBeInTheDocument()
    })

    it('등락률 기준으로 정렬이 가능하다', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const changeHeader = screen.getByText('등락률').closest('th')

      // 등락률 클릭 (오름차순)
      await user.click(changeHeader)

      const rows = screen.getAllByRole('row')
      const firstRow = rows[1]
      // 가장 낮은 등락률은 -1.20% (종가 셀과 등락률 컬럼 두 곳에 표시된다)
      expect(within(firstRow).getAllByText('-1.20%')).toHaveLength(2)
    })

    it('같은 컬럼을 두 번 클릭하면 정렬 방향이 반대로 바뀐다', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const dateHeader = screen.getByText('일자').closest('th')

      // 첫 번째 클릭 (오름차순)
      await user.click(dateHeader)
      let rows = screen.getAllByRole('row')
      let firstRow = rows[1]
      expect(within(firstRow).getByText('2025-11-06')).toBeInTheDocument()

      // 두 번째 클릭 (내림차순)
      await user.click(dateHeader)
      rows = screen.getAllByRole('row')
      firstRow = rows[1]
      expect(within(firstRow).getByText('2025-11-10')).toBeInTheDocument()
    })
  })

  describe('페이지네이션', () => {
    // 페이지네이션 테스트를 위한 더 많은 데이터
    const largeMockData = Array.from({ length: 50 }, (_, i) => ({
      date: `2025-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      open_price: 15000 + i * 10,
      high_price: 15100 + i * 10,
      low_price: 14900 + i * 10,
      close_price: 15050 + i * 10,
      volume: 1000000 + i * 1000,
      daily_change_pct: (i % 5) - 2,
    }))

    it('페이지당 지정된 개수만큼 데이터를 표시한다', () => {
      renderWithProviders(<PriceTable data={largeMockData} itemsPerPage={10} />)

      // 헤더 제외하고 데이터 행만 카운트
      const rows = screen.getAllByRole('row')
      expect(rows.length - 1).toBe(10) // 헤더 1개 제외
    })

    it('페이지네이션 버튼이 표시된다', () => {
      renderWithProviders(<PriceTable data={largeMockData} itemsPerPage={10} />)

      expect(screen.getByText('이전')).toBeInTheDocument()
      expect(screen.getByText('다음')).toBeInTheDocument()
      expect(screen.getByText('1 / 5')).toBeInTheDocument() // 50개 데이터 / 10개씩 = 5페이지
    })

    it('다음 버튼을 클릭하면 다음 페이지로 이동한다', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PriceTable data={largeMockData} itemsPerPage={10} />)

      const nextButton = screen.getByText('다음')
      await user.click(nextButton)

      expect(screen.getByText('2 / 5')).toBeInTheDocument()
    })

    it('이전 버튼을 클릭하면 이전 페이지로 이동한다', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PriceTable data={largeMockData} itemsPerPage={10} />)

      const nextButton = screen.getByText('다음')
      const prevButton = screen.getByText('이전')

      await user.click(nextButton)
      expect(screen.getByText('2 / 5')).toBeInTheDocument()

      await user.click(prevButton)
      expect(screen.getByText('1 / 5')).toBeInTheDocument()
    })

    it('첫 페이지에서 이전 버튼이 비활성화된다', () => {
      renderWithProviders(<PriceTable data={largeMockData} itemsPerPage={10} />)

      const prevButton = screen.getByText('이전')
      expect(prevButton).toBeDisabled()
    })

    it('마지막 페이지에서 다음 버튼이 비활성화된다', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PriceTable data={largeMockData} itemsPerPage={10} />)

      const nextButton = screen.getByText('다음')

      // 마지막 페이지까지 이동
      for (let i = 0; i < 4; i++) {
        await user.click(nextButton)
      }

      expect(screen.getByText('5 / 5')).toBeInTheDocument()
      expect(nextButton).toBeDisabled()
    })

    it('정렬 시 첫 페이지로 돌아간다', async () => {
      const user = userEvent.setup()
      const { container } = renderWithProviders(<PriceTable data={largeMockData} itemsPerPage={10} />)

      // 2페이지로 이동
      const nextButton = screen.getByText('다음')
      await user.click(nextButton)
      expect(screen.getByText('2 / 5')).toBeInTheDocument()

      // 정렬 클릭
      const desktopTable = container.querySelector('.hidden.md\\:block table')
      const closeHeader = within(desktopTable).getByText('종가').closest('th')
      await user.click(closeHeader)

      // 첫 페이지로 돌아감
      expect(screen.getByText('1 / 5')).toBeInTheDocument()
    })

    it('데이터가 한 페이지에 모두 표시되면 페이지네이션이 숨겨진다', () => {
      renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={20} />)

      expect(screen.queryByText('이전')).not.toBeInTheDocument()
      expect(screen.queryByText('다음')).not.toBeInTheDocument()
    })
  })

  describe('반응형 디자인', () => {
    it('데스크톱에서 테이블로 표시된다', () => {
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const desktopTable = container.querySelector('.hidden.md\\:block')
      expect(desktopTable).toBeInTheDocument()
    })

    it('모바일에서 카드로 표시된다', () => {
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const mobileCards = container.querySelector('.md\\:hidden')
      expect(mobileCards).toBeInTheDocument()
    })
  })

  describe('에러 처리', () => {
    it('daily_change_pct가 없는 데이터도 처리한다', () => {
      const dataWithoutChange = [
        {
          date: '2025-11-10',
          open_price: 15100,
          high_price: 15300,
          low_price: 15000,
          close_price: 15250,
          volume: 1250000,
          // daily_change_pct 없음
        },
      ]

      const { container } = renderWithProviders(<PriceTable data={dataWithoutChange} itemsPerPage={10} />)

      const desktopTable = container.querySelector('.hidden.md\\:block table')
      expect(within(desktopTable).getByText('2025-11-10')).toBeInTheDocument()
    })

    it('잘못된 날짜 형식도 처리한다', () => {
      const dataWithInvalidDate = [
        {
          date: 'invalid-date',
          open_price: 15100,
          high_price: 15300,
          low_price: 15000,
          close_price: 15250,
          volume: 1250000,
          daily_change_pct: 2.34,
        },
      ]

      // 에러 없이 렌더링되어야 함
      const { container } = renderWithProviders(<PriceTable data={dataWithInvalidDate} itemsPerPage={10} />)

      // 잘못된 날짜 형식이 그대로 표시되어야 함
      const desktopTable = container.querySelector('.hidden.md\\:block table')
      expect(within(desktopTable).getByText('invalid-date')).toBeInTheDocument()
    })
  })

  describe('시가·고가·저가 등락률', () => {
    it('기준가 대비 등락률을 계산한다', () => {
      expect(changePctFrom(15100, 15000)).toBeCloseTo(0.6667, 3)
      expect(changePctFrom(14900, 15000)).toBeCloseTo(-0.6667, 3)
      expect(changePctFrom(15000, 15000)).toBe(0)
    })

    it('가격이나 기준가가 없으면 null을 반환한다', () => {
      expect(changePctFrom(null, 15000)).toBeNull()
      expect(changePctFrom(15000, undefined)).toBeNull()
      expect(changePctFrom(15000, 0)).toBeNull()
    })

    it('전일 종가는 날짜 오름차순 직전 행의 종가를 쓴다', () => {
      const map = buildPrevCloseMap(mockPriceData)

      // 2025-11-10의 전일 종가 = 2025-11-09 종가
      expect(map.get('2025-11-10')).toBe(15100)
      expect(map.get('2025-11-09')).toBe(15000)
      expect(map.get('2025-11-07')).toBe(15150)
    })

    it('가장 오래된 행은 자신의 종가·등락률로 전일 종가를 역산한다', () => {
      const map = buildPrevCloseMap(mockPriceData)

      // 2025-11-06: 종가 15150, 등락률 +0.67% → 15150 / 1.0067
      expect(map.get('2025-11-06')).toBeCloseTo(15150 / 1.0067, 2)
    })

    it('가장 오래된 행에 등락률이 없으면 전일 종가를 만들지 않는다', () => {
      const map = buildPrevCloseMap([
        { date: '2025-11-06', close_price: 15150, daily_change_pct: null },
        { date: '2025-11-07', close_price: 14950, daily_change_pct: -1.2 },
      ])

      expect(map.has('2025-11-06')).toBe(false)
      expect(map.get('2025-11-07')).toBe(15150)
    })

    it('시가는 전일 종가 대비, 고가·저가는 시가 대비로 표시한다', () => {
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const desktopTable = container.querySelector('.hidden.md\\:block table')
      const row = within(desktopTable).getByText('2025-11-08').closest('tr')

      // 시가 14900 vs 전일(11-07) 종가 14950 → -0.33%
      expect(within(row).getByText('-0.33%')).toBeInTheDocument()
      // 고가 15100 vs 시가 14900 → +1.34%
      expect(within(row).getByText('+1.34%')).toBeInTheDocument()
      // 저가 14850 vs 시가 14900 → -0.34%
      expect(within(row).getByText('-0.34%')).toBeInTheDocument()
    })

    it('상승은 빨강, 하락은 파랑으로 표시한다', () => {
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const desktopTable = container.querySelector('.hidden.md\\:block table')
      const row = within(desktopTable).getByText('2025-11-08').closest('tr')

      expect(within(row).getByText('+1.34%')).toHaveClass('text-red-600')
      expect(within(row).getByText('-0.34%')).toHaveClass('text-blue-600')
    })

    it('종가는 API가 준 daily_change_pct를 그대로 쓴다', () => {
      expect(closeChangePct({ close_price: 15250, daily_change_pct: 2.34 }, 15100)).toBe(2.34)
    })

    it('종가 등락률이 없으면 전일 종가로 계산한다', () => {
      expect(closeChangePct({ close_price: 15250, daily_change_pct: null }, 15100)).toBeCloseTo(0.9934, 3)
      expect(closeChangePct({ close_price: 15250 }, undefined)).toBeNull()
    })

    it('종가 셀에도 전일 종가 대비 등락률을 표시한다', () => {
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const desktopTable = container.querySelector('.hidden.md\\:block table')
      const row = within(desktopTable).getByText('2025-11-08').closest('tr')

      // 종가 셀과 등락률 컬럼 두 곳에 -0.50%가 표시된다
      expect(within(row).getAllByText('-0.50%')).toHaveLength(2)
    })

    it('정렬을 바꿔도 등락률 기준가가 유지된다', async () => {
      const user = userEvent.setup()
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      const desktopTable = container.querySelector('.hidden.md\\:block table')
      await user.click(within(desktopTable).getByText('종가'))

      // 종가 정렬 후에도 11-08 행의 시가 등락률은 전일 종가(14950) 기준 그대로다
      const row = within(desktopTable).getByText('2025-11-08').closest('tr')
      expect(within(row).getByText('-0.33%')).toBeInTheDocument()
      expect(within(row).getByText('+1.34%')).toBeInTheDocument()
    })
  })

  describe('다크모드', () => {
    it('다크모드 스타일 클래스가 포함되어 있다', () => {
      const { container } = renderWithProviders(<PriceTable data={mockPriceData} itemsPerPage={10} />)

      // dark: 클래스가 있는지 확인
      const darkModeElements = container.querySelectorAll('[class*="dark:"]')
      expect(darkModeElements.length).toBeGreaterThan(0)
    })
  })
})
