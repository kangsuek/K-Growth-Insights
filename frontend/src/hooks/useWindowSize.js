import { useState, useEffect } from 'react'

/**
 * useWindowSize 커스텀 훅
 * 윈도우 크기를 추적하고 반응형 차트 높이를 계산
 *
 * @returns {Object} { width, height, chartHeight }
 */
export function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  })

  useEffect(() => {
    // SSR 환경 체크
    if (typeof window === 'undefined') return

    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener('resize', handleResize)

    // 초기 크기 설정
    handleResize()

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 반응형 차트 높이 계산
  const getChartHeight = () => {
    if (windowSize.width < 768) {
      // 모바일
      return 250
    } else if (windowSize.width < 1024) {
      // 태블릿
      return 350
    } else {
      // 데스크톱
      return 450
    }
  }

  return {
    width: windowSize.width,
    height: windowSize.height,
    chartHeight: getChartHeight(),
  }
}
