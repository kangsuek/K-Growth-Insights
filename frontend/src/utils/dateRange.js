/**
 * 날짜 범위 계산 유틸리티
 * 초기 날짜 범위를 즉시 계산하여 API 호출 지연 방지
 */
import { subDays, subMonths, subYears, startOfYear, format } from 'date-fns'

/**
 * 날짜 범위 계산
 * @param {string} range - '7d', '1m', '3m', '6m', 'ytd', '1y'
 * @returns {{ startDate: string, endDate: string, range: string }}
 */
export function calculateDateRange(range = '7d') {
  const today = new Date()
  let calculatedStartDate

  switch (range) {
    case '7d':
      calculatedStartDate = subDays(today, 7)
      break
    case '1m':
      calculatedStartDate = subMonths(today, 1)
      break
    case '3m':
      calculatedStartDate = subMonths(today, 3)
      break
    case '6m':
      calculatedStartDate = subMonths(today, 6)
      break
    case 'ytd':
      calculatedStartDate = startOfYear(today)
      break
    case '1y':
      calculatedStartDate = subYears(today, 1)
      break
    default:
      calculatedStartDate = subDays(today, 7)
  }

  return {
    startDate: format(calculatedStartDate, 'yyyy-MM-dd'),
    endDate: format(today, 'yyyy-MM-dd'),
    range
  }
}
