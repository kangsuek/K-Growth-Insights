/**
 * 차트 유틸리티 함수 모음
 */

import { MAX_CHART_POINTS } from '../constants'

/**
 * 대용량 데이터 샘플링 함수
 * 1000개 이상의 데이터 포인트가 있을 때 매 n번째 포인트만 선택하여 성능 최적화
 *
 * @param {Array} data - 원본 데이터 배열
 * @param {number} maxPoints - 최대 표시할 포인트 수 (기본값: MAX_CHART_POINTS)
 * @returns {Array} - 샘플링된 데이터 배열
 */
export function sampleData(data, maxPoints = MAX_CHART_POINTS) {
  if (!data || data.length === 0) return []
  if (data.length <= maxPoints) return data

  // 샘플링 간격 계산
  const interval = Math.ceil(data.length / maxPoints)

  // 매 interval번째 포인트만 선택 (첫 번째와 마지막은 항상 포함)
  const sampledData = []
  for (let i = 0; i < data.length; i += interval) {
    sampledData.push(data[i])
  }

  // 마지막 포인트가 포함되지 않았다면 추가
  if (sampledData[sampledData.length - 1] !== data[data.length - 1]) {
    sampledData.push(data[data.length - 1])
  }

  return sampledData
}

/**
 * 차트 렌더링 성능 측정 유틸리티
 *
 * @param {string} label - 측정할 작업의 라벨
 * @param {Function} fn - 실행할 함수
 * @returns {*} - 함수의 반환값
 */
export function measureChartPerformance(label, fn) {
  // Performance measurement disabled in production
  if (import.meta.env.PROD || import.meta.env.MODE === 'production') {
    return fn()
  }

  const start = performance.now()
  try {
    const result = fn()
    const duration = performance.now() - start

    if (duration > 500) {
      console.warn(`[Chart Performance] ⚠️ ${label} took longer than 500ms: ${duration.toFixed(2)}ms`)
    } else {
      console.log(`[Chart Performance] ${label}: ${duration.toFixed(2)}ms`)
    }

    return result
  } catch (error) {
    const duration = performance.now() - start
    console.error(`[Chart Performance] ❌ ${label} failed after ${duration.toFixed(2)}ms`)
    throw error
  }
}

/**
 * 데이터 검증 유틸리티
 * 차트 데이터의 유효성을 검증하고 문제가 있으면 에러 메시지 반환
 *
 * @param {Array} data - 검증할 데이터
 * @param {Array} requiredFields - 필수 필드 목록
 * @returns {Object} { isValid: boolean, error: string }
 */
export function validateChartData(data, requiredFields = []) {
  if (!data) {
    return { isValid: false, error: '데이터가 없습니다' }
  }

  if (!Array.isArray(data)) {
    return { isValid: false, error: '데이터 형식이 올바르지 않습니다 (배열이 아님)' }
  }

  if (data.length === 0) {
    return { isValid: false, error: '데이터가 비어있습니다' }
  }

  // 필수 필드 검증
  if (requiredFields.length > 0) {
    const firstItem = data[0]
    const missingFields = requiredFields.filter(field => !(field in firstItem))

    if (missingFields.length > 0) {
      return {
        isValid: false,
        error: `필수 필드가 누락되었습니다: ${missingFields.join(', ')}`
      }
    }
  }

  return { isValid: true, error: null }
}

/**
 * 차트 높이 계산 유틸리티
 * 화면 크기에 따라 적절한 차트 높이 반환
 *
 * @param {number} width - 화면 너비
 * @returns {number} - 차트 높이 (px)
 */
export function getResponsiveChartHeight(width) {
  if (width < 768) {
    // 모바일
    return 250
  } else if (width < 1024) {
    // 태블릿
    return 350
  } else {
    // 데스크톱
    return 450
  }
}
