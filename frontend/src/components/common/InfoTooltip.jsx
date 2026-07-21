import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'

/**
 * InfoTooltip 컴포넌트
 * 금융 용어나 지표에 대한 설명을 제공하는 툴팁
 * ? 아이콘에 마우스 오버 시 설명 텍스트 표시
 */
export default function InfoTooltip({ content, position = 'top' }) {
  const [visible, setVisible] = useState(false)
  const tooltipRef = useRef(null)
  const buttonRef = useRef(null)

  // 화면 밖으로 나가지 않도록 위치 조정
  useEffect(() => {
    if (visible && tooltipRef.current && buttonRef.current) {
      const tooltip = tooltipRef.current
      const rect = tooltip.getBoundingClientRect()
      if (rect.right > window.innerWidth) {
        tooltip.style.left = 'auto'
        tooltip.style.right = '0'
      }
      if (rect.left < 0) {
        tooltip.style.left = '0'
        tooltip.style.right = 'auto'
      }
    }
  }, [visible])

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1',
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-xs font-bold leading-none flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors cursor-help flex-shrink-0"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        aria-label="도움말"
      >
        ?
      </button>
      {visible && (
        <span
          ref={tooltipRef}
          className={`absolute z-50 w-56 px-3 py-2 text-xs text-white bg-gray-800 dark:bg-gray-900 rounded-lg shadow-lg pointer-events-none ${positionClasses[position]}`}
          role="tooltip"
        >
          {content}
          {/* 화살표 */}
          {position === 'top' && (
            <span className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800 dark:border-t-gray-900" />
          )}
          {position === 'bottom' && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800 dark:border-b-gray-900" />
          )}
        </span>
      )}
    </span>
  )
}

InfoTooltip.propTypes = {
  content: PropTypes.string.isRequired,
  position: PropTypes.oneOf(['top', 'bottom', 'left', 'right']),
}
