import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

/**
 * StockContextMenu 컴포넌트
 * 히트맵 셀 / 종목 카드 우클릭 시 표시되는 컨텍스트 메뉴 ("종목 삭제")
 *
 * @param {number} x - 메뉴 표시 x 좌표 (viewport 기준)
 * @param {number} y - 메뉴 표시 y 좌표 (viewport 기준)
 * @param {string} ticker - 종목 코드
 * @param {string} name - 종목명
 * @param {Function} onDelete - "종목 삭제" 클릭 콜백
 * @param {Function} onClose - 메뉴 닫기 콜백 (외부 클릭 / ESC)
 */
export default function StockContextMenu({ x, y, ticker, name, onDelete, onClose }) {
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // 메뉴가 화면 밖으로 나가지 않도록 위치 보정
  const menuWidth = 180
  const menuHeight = 76
  const adjustedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8))
  const adjustedY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8))

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 transition-colors"
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      role="menu"
    >
      <div className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 truncate">
        {name} ({ticker})
      </div>
      <button
        onClick={onDelete}
        role="menuitem"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        종목 삭제
      </button>
    </div>
  )
}

StockContextMenu.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  ticker: PropTypes.string.isRequired,
  name: PropTypes.string,
  onDelete: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}
