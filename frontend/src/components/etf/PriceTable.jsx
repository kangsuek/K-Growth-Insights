import { useState, useMemo } from 'react'
import PropTypes from 'prop-types'
import { format } from 'date-fns'
import { formatPrice, formatVolume, formatPercent, getPriceChangeColor } from '../../utils/format'

/**
 * PriceTable 컴포넌트
 * 일자별 가격 데이터를 테이블 형태로 표시
 *
 * 기능:
 * - 일자, 시가, 고가, 저가, 종가, 거래량, 등락률 표시
 * - 정렬 기능 (일자, 종가, 거래량, 등락률)
 * - 등락률 색상 표시 (빨강/파랑)
 * - 반응형 디자인 (모바일: 카드 형태)
 * - 다크모드 지원
 * - 페이지네이션
 */
export default function PriceTable({ data = [], itemsPerPage = 20 }) {
  const [sortConfig, setSortConfig] = useState({
    key: 'date',
    direction: 'desc'
  })
  const [currentPage, setCurrentPage] = useState(1)

  // 정렬 핸들러
  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
    setCurrentPage(1) // 정렬 시 첫 페이지로 이동
  }

  // 정렬된 데이터
  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return []

    const sorted = [...data].sort((a, b) => {
      let aValue, bValue

      switch (sortConfig.key) {
        case 'date':
          aValue = new Date(a.date).getTime()
          bValue = new Date(b.date).getTime()
          break
        case 'close':
          aValue = a.close_price
          bValue = b.close_price
          break
        case 'volume':
          aValue = a.volume
          bValue = b.volume
          break
        case 'change':
          aValue = a.daily_change_pct || 0
          bValue = b.daily_change_pct || 0
          break
        default:
          return 0
      }

      if (sortConfig.direction === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    return sorted
  }, [data, sortConfig])

  // 페이지네이션된 데이터
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return sortedData.slice(startIndex, endIndex)
  }, [sortedData, currentPage, itemsPerPage])

  // 총 페이지 수
  const totalPages = Math.ceil(sortedData.length / itemsPerPage)

  // 정렬 아이콘 렌더링
  const renderSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <span className="text-gray-300 dark:text-gray-600 ml-0.5">↕</span>
    }
    return <span className="text-primary-500 ml-0.5">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
  }

  // 빈 데이터 처리
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>가격 데이터가 없습니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 데스크톱 테이블 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th
                className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-1">
                  <span>일자</span>
                  {renderSortIcon("date")}
                </div>
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                시가
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                고가
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300">
                저가
              </th>
              <th
                className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleSort('close')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>종가</span>
                  {renderSortIcon("close")}
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleSort('volume')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>거래량</span>
                  {renderSortIcon("volume")}
                </div>
              </th>
              <th
                className="px-4 py-3 text-right text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => handleSort('change')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>등락률</span>
                  {renderSortIcon("change")}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((price, index) => (
              <tr
                key={`${price.date}-${index}`}
                className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {(() => {
                    try {
                      const date = new Date(price.date)
                      if (isNaN(date.getTime())) return price.date
                      return format(date, 'yyyy-MM-dd')
                    } catch {
                      return price.date
                    }
                  })()}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                  {formatPrice(price.open_price)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                  {formatPrice(price.high_price)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                  {formatPrice(price.low_price)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrice(price.close_price)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                  {formatVolume(price.volume)}
                </td>
                <td className={`px-4 py-3 text-sm text-right font-semibold ${getPriceChangeColor(price.daily_change_pct)}`}>
                  {formatPercent(price.daily_change_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="md:hidden space-y-3">
        {paginatedData.map((price, index) => (
          <div
            key={`${price.date}-${index}`}
            className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200 dark:border-gray-600">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {(() => {
                  try {
                    const date = new Date(price.date)
                    if (isNaN(date.getTime())) return price.date
                    return format(date, 'yyyy-MM-dd')
                  } catch {
                    return price.date
                  }
                })()}
              </span>
              <span className={`text-sm font-bold ${getPriceChangeColor(price.daily_change_pct)}`}>
                {formatPercent(price.daily_change_pct)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">시가</span>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                  {formatPrice(price.open_price)}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">고가</span>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                  {formatPrice(price.high_price)}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">저가</span>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                  {formatPrice(price.low_price)}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">종가</span>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">
                  {formatPrice(price.close_price)}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">거래량</span>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                  {formatVolume(price.volume)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            이전
          </button>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}

PriceTable.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      open_price: PropTypes.number.isRequired,
      high_price: PropTypes.number.isRequired,
      low_price: PropTypes.number.isRequired,
      close_price: PropTypes.number.isRequired,
      volume: PropTypes.number.isRequired,
      daily_change_pct: PropTypes.number,
    })
  ),
  itemsPerPage: PropTypes.number,
}
