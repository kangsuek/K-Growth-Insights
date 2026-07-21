import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

/**
 * TickerSelector Component
 *
 * 종목 선택 컴포넌트 (다중 선택, 2~maxSelection개 제한)
 * maxSelection은 부모(Comparison)에서 constants.COMPARE_MAX_TICKERS로 전달 권장
 *
 * @param {Array} tickers - 전체 종목 목록
 * @param {Array} selectedTickers - 선택된 종목 코드 배열
 * @param {Function} onSelectionChange - 선택 변경 콜백
 * @param {number} maxSelection - 최대 선택 개수 (기본 20)
 */
export default function TickerSelector({ tickers, selectedTickers = [], onSelectionChange, maxSelection = 20 }) {
  const [selected, setSelected] = useState(selectedTickers)

  useEffect(() => {
    setSelected(selectedTickers)
  }, [selectedTickers])

  const handleToggle = (ticker) => {
    let newSelected

    if (selected.includes(ticker)) {
      // 선택 해제
      newSelected = selected.filter(t => t !== ticker)
    } else {
      // 선택 추가 (최대 maxSelection개)
      if (selected.length >= maxSelection) {
        return
      }
      newSelected = [...selected, ticker]
    }

    setSelected(newSelected)

    if (onSelectionChange) {
      onSelectionChange(newSelected)
    }
  }

  const handleClearAll = () => {
    setSelected([])
    onSelectionChange([])
  }

  const canCompare = selected.length >= 2 && selected.length <= maxSelection
  const selectionCount = selected.length

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            종목 선택
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {`비교할 종목을 선택하세요 (최소 2개, 최대 ${maxSelection}개)`}
          </p>
        </div>
        {selectionCount > 0 && (
          <button
            onClick={handleClearAll}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            전체 해제
          </button>
        )}
      </div>

      {/* 선택 상태 표시 */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-sm font-medium ${
          canCompare
            ? 'text-green-600 dark:text-green-400'
            : 'text-gray-600 dark:text-gray-400'
        }`}>
          {selectionCount}개 선택됨
        </span>
        {!canCompare && selectionCount > 0 && (
          <span className="text-sm text-orange-600 dark:text-orange-400">
            {selectionCount < 2 ? '최소 2개 이상 선택하세요' : ''}
            {selectionCount > maxSelection ? `최대 ${maxSelection}개까지 선택 가능합니다` : ''}
          </span>
        )}
      </div>

      {/* 선택된 종목 뱃지 */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          {selected.map(ticker => {
            const tickerInfo = tickers.find(t => t.ticker === ticker)
            return (
              <span
                key={ticker}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium"
              >
                {tickerInfo?.name || ticker}
                <button
                  onClick={() => handleToggle(ticker)}
                  className="ml-1 hover:text-blue-900 dark:hover:text-blue-100 transition-colors"
                  aria-label={`Remove ${ticker}`}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* 종목 목록 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tickers.map(ticker => {
          const isSelected = selected.includes(ticker.ticker)
          const canSelect = !isSelected && selectionCount < maxSelection

          return (
            <label
              key={ticker.ticker}
              className={`
                flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all
                ${isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }
                ${!canSelect && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggle(ticker.ticker)}
                disabled={!canSelect && !isSelected}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-white truncate">
                  {ticker.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {ticker.ticker} · {ticker.theme}
                </div>
              </div>
            </label>
          )
        })}
      </div>

      {/* 에러 메시지 */}
      {tickers.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          종목 데이터를 불러오는 중...
        </div>
      )}
    </div>
  )
}

TickerSelector.propTypes = {
  tickers: PropTypes.arrayOf(PropTypes.shape({
    ticker: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    type: PropTypes.string,
    theme: PropTypes.string,
  })).isRequired,
  selectedTickers: PropTypes.arrayOf(PropTypes.string),
  onSelectionChange: PropTypes.func.isRequired,
  maxSelection: PropTypes.number,
}
