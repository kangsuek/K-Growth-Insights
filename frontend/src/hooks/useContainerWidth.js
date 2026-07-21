import { useState, useEffect, useRef } from 'react'

/**
 * 컨테이너 너비를 측정하는 커스텀 Hook
 * ResizeObserver를 사용하여 컨테이너 크기 변경을 감지
 * 
 * @returns {Object} { containerRef, width }
 */
export function useContainerWidth() {
  const [width, setWidth] = useState(0)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    // 초기 너비 설정
    const updateWidth = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.offsetWidth)
      }
    }

    // 초기 설정
    updateWidth()

    // ResizeObserver로 크기 변경 감지
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width)
      }
    })

    resizeObserver.observe(containerRef.current)

    // fallback: window resize 이벤트
    window.addEventListener('resize', updateWidth)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
  }, [])

  return { containerRef, width }
}

