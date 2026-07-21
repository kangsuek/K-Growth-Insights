/**
 * 유효성 검증 유틸리티 함수
 * 
 * 프론트엔드와 백엔드 간 검증 규칙을 통일하기 위한 유틸리티
 */

import { differenceInDays, isAfter, isFuture, parseISO } from 'date-fns'
import { MAX_DATE_RANGE_DAYS } from '../constants'

/**
 * 날짜 범위 검증
 * 
 * @param {string|Date} startDate - 시작 날짜
 * @param {string|Date} endDate - 종료 날짜
 * @returns {{ isValid: boolean, error?: string }} 검증 결과
 */
export function validateDateRange(startDate, endDate) {
  // 날짜가 없는 경우
  if (!startDate || !endDate) {
    return {
      isValid: false,
      error: '시작 날짜와 종료 날짜를 모두 입력해주세요.'
    }
  }

  // 날짜 파싱
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate
  const end = typeof endDate === 'string' ? parseISO(endDate) : endDate

  // 미래 날짜 검증
  if (isFuture(start) || isFuture(end)) {
    return {
      isValid: false,
      error: '미래 날짜는 선택할 수 없습니다.'
    }
  }

  // 시작일이 종료일보다 늦은 경우
  if (isAfter(start, end)) {
    return {
      isValid: false,
      error: '시작 날짜는 종료 날짜보다 이전이어야 합니다.'
    }
  }

  // 날짜 범위가 너무 긴 경우
  const daysDiff = differenceInDays(end, start)
  if (daysDiff > MAX_DATE_RANGE_DAYS) {
    return {
      isValid: false,
      error: `최대 조회 기간은 ${MAX_DATE_RANGE_DAYS}일(1년)입니다.`
    }
  }

  return { isValid: true }
}

/**
 * 날짜 문자열 형식 검증
 * 
 * @param {string} dateString - 검증할 날짜 문자열 (YYYY-MM-DD 형식)
 * @returns {boolean} 유효한 날짜 형식인지 여부
 */
export function isValidDateFormat(dateString) {
  if (!dateString) return false
  
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateString)) return false
  
  const date = parseISO(dateString)
  return !isNaN(date.getTime())
}

