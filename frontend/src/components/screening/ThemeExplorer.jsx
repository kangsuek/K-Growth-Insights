import { useQuery } from '@tanstack/react-query'
import { scannerApi } from '../../services/api'
import LoadingIndicator from '../common/LoadingIndicator'
import { CACHE_STALE_TIME_STATIC } from '../../constants'
import { formatPercent, getChangeColor } from '../../utils/formatters'

export default function ThemeExplorer({ onSectorClick, onCollectData, isCollecting }) {
  const { data: themes, isLoading, error } = useQuery({
    queryKey: ['scanner-themes'],
    queryFn: async () => {
      const res = await scannerApi.getThemes()
      return res.data
    },
    staleTime: CACHE_STALE_TIME_STATIC,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingIndicator text="테마 데이터 로딩 중..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
        <p className="text-red-600 dark:text-red-400 text-sm">{error.message}</p>
      </div>
    )
  }

  if (!themes || themes.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center transition-colors">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          테마 데이터가 없습니다. 데이터를 먼저 수집해주세요.
        </p>
        {onCollectData && (
          <button
            onClick={onCollectData}
            disabled={isCollecting}
            className="btn btn-primary btn-sm"
          >
            <svg className={`w-4 h-4 mr-1 ${isCollecting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isCollecting ? '수집 중...' : '데이터 수집'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {themes.map((theme) => (
        <div
          key={theme.sector}
          onClick={() => onSectorClick(theme.sector)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSectorClick(theme.sector))}
          role="button"
          tabIndex={0}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {/* 섹터명 + 통계 */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {theme.sector}
            </h3>
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">
              {theme.count}개
            </span>
          </div>

          {/* 평균 주간수익률 */}
          <div className="mb-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">평균 주간수익률</span>
            <p className={`text-lg font-bold ${getChangeColor(theme.avg_weekly_return)}`}>
              {formatPercent(theme.avg_weekly_return)}
            </p>
          </div>

          {/* Top 3 종목 */}
          <div className="space-y-1.5 border-t border-gray-100 dark:border-gray-700 pt-2">
            {theme.top_performers.map((item, idx) => (
              <div key={item.ticker} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400 truncate mr-2">
                  <span className="text-gray-400 dark:text-gray-500 mr-1">{idx + 1}.</span>
                  {item.name}
                </span>
                <span className={`font-medium tabular-nums flex-shrink-0 ${getChangeColor(item.weekly_return)}`}>
                  {formatPercent(item.weekly_return)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
