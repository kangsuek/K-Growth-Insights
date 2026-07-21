import { Link, useNavigate } from 'react-router-dom'
import { formatNumber, formatSignedNumber, formatPercent, getChangeColor } from '../../utils/formatters'

const COLUMNS = [
  { key: 'name', label: '종목명', sortable: true },
  { key: 'close_price', label: '현재가', sortable: true, align: 'right' },
  { key: 'daily_change_pct', label: '등락률', sortable: true, align: 'right' },
  { key: 'volume', label: '거래량', sortable: true, align: 'right' },
  { key: 'weekly_return', label: '주간', sortable: true, align: 'right' },
  { key: 'monthly_return', label: '월간', sortable: true, align: 'right' },
  { key: 'ytd_return', label: '연간(YTD)', sortable: true, align: 'right' },
  { key: 'foreign_net', label: '외국인', sortable: true, align: 'right' },
  { key: 'institutional_net', label: '기관', sortable: true, align: 'right' },
]

function SortIcon({ column, sortBy, sortDir }) {
  if (sortBy !== column) {
    return <span className="text-gray-300 dark:text-gray-600 ml-0.5">↕</span>
  }
  return <span className="text-primary-500 ml-0.5">{sortDir === 'asc' ? '▲' : '▼'}</span>
}

export default function ScreeningTable({ items, total, page, pageSize, sortBy, sortDir, onSort, onPageChange }) {
  const navigate = useNavigate()

  const totalPages = Math.ceil(total / pageSize)

  if (!items || items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center transition-colors">
        <p className="text-gray-500 dark:text-gray-400">검색 결과가 없습니다. 필터를 조정해보세요.</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden transition-colors">
      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.sortable ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none' : ''}`}
                  onClick={() => col.sortable && onSort(col.key)}
                  onKeyDown={(e) => col.sortable && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSort(col.key))}
                  tabIndex={col.sortable ? 0 : undefined}
                  role={col.sortable ? 'button' : undefined}
                  aria-sort={col.sortable && sortBy === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    {col.sortable && <SortIcon column={col.key} sortBy={sortBy} sortDir={sortDir} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((item) => (
              <tr key={item.ticker} className="transition-colors">
                {/* 종목명 */}
                <td className="px-3 py-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      {item.is_registered ? (
                        <Link
                          to={`/etf/${item.ticker}`}
                          className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline transition-colors"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <button
                          onClick={() => navigate('/settings', {
                            state: {
                              addStock: {
                                ticker: item.ticker,
                                name: item.name,
                                type: item.type,
                                theme: item.sector || '',
                              },
                            },
                          })}
                          className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                        >
                          {item.name}
                        </button>
                      )}
                      {item.market && (
                        <span className={`inline-block px-1 py-0.5 text-xs rounded font-medium flex-shrink-0 ${
                          item.market === 'ETF'
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            : item.market === 'KOSPI'
                            ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                            : 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                        }`}>
                          {item.market}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{item.ticker}</p>
                  </div>
                </td>
                {/* 현재가 */}
                <td className="px-3 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                  {formatNumber(item.close_price)}
                </td>
                {/* 등락률 */}
                <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${getChangeColor(item.daily_change_pct)}`}>
                  {formatPercent(item.daily_change_pct)}
                </td>
                {/* 거래량 */}
                <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                  {formatNumber(item.volume)}
                </td>
                {/* 주간수익률 */}
                <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${getChangeColor(item.weekly_return)}`}>
                  {formatPercent(item.weekly_return)}
                </td>
                {/* 월간수익률 */}
                <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${getChangeColor(item.monthly_return)}`}>
                  {formatPercent(item.monthly_return)}
                </td>
                {/* 연간수익률 */}
                <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${getChangeColor(item.ytd_return)}`}>
                  <div className="flex flex-col items-end">
                    <span>{formatPercent(item.ytd_return)}</span>
                    {item.ytd_base_date && !item.ytd_base_date.startsWith(`${new Date().getFullYear()}.01`) && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">
                        {item.ytd_base_date.slice(5)} ~
                      </span>
                    )}
                  </div>
                </td>
                {/* 외국인 */}
                <td className={`px-3 py-2.5 text-right tabular-nums ${getChangeColor(item.foreign_net)}`}>
                  {formatSignedNumber(item.foreign_net)}
                </td>
                {/* 기관 */}
                <td className={`px-3 py-2.5 text-right tabular-nums ${getChangeColor(item.institutional_net)}`}>
                  {formatSignedNumber(item.institutional_net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            총 {total.toLocaleString()}개 중 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-2.5 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              이전
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (page <= 3) {
                pageNum = i + 1
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = page - 2 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`px-2.5 py-1 text-sm rounded border transition-colors ${
                    page === pageNum
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-2.5 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
