import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { scannerApi } from '../../services/api'
import { CACHE_STALE_TIME_STATIC } from '../../constants'
import { formatNumber, formatPercent, getChangeColor } from '../../utils/formatters'

const PRESET_ICONS = {
  weekly_top_return: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  foreign_buying: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  institutional_buying: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
}

export default function RecommendationCards() {
  const navigate = useNavigate()
  const { data: presets, isLoading } = useQuery({
    queryKey: ['scanner-recommendations'],
    queryFn: async () => {
      const res = await scannerApi.getRecommendations(3)
      return res.data
    },
    staleTime: CACHE_STALE_TIME_STATIC,
    retry: 1,
  })

  // 데이터 없거나 로딩 중이면 렌더링하지 않음
  if (isLoading || !presets || presets.length === 0) return null

  // 최대 3개 프리셋만 표시
  const visiblePresets = presets.slice(0, 3)

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          ETF 추천
        </h2>
        <Link
          to="/scanner"
          className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
        >
          더보기 &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {visiblePresets.map((preset) => (
          <div
            key={preset.preset_id}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 transition-colors"
          >
            {/* 헤더 */}
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-primary-500">
                {PRESET_ICONS[preset.preset_id] || PRESET_ICONS.weekly_top_return}
              </span>
              <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                {preset.title}
              </h3>
            </div>

            {/* Top 3 종목 */}
            <div className="space-y-1.5">
              {preset.items.map((item, idx) => (
                <div
                  key={item.ticker}
                  onClick={() => {
                    if (item.is_registered) {
                      navigate(`/etf/${item.ticker}`)
                    } else {
                      navigate('/settings', { state: { addStock: { ticker: item.ticker, name: item.name, type: item.type, theme: '' } } })
                    }
                  }}
                  className="flex items-center justify-between py-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1 -mx-1 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-gray-400 w-3">{idx + 1}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {formatNumber(item.close_price)}
                    </span>
                    <span className={`text-xs font-medium tabular-nums ${getChangeColor(item.weekly_return)}`}>
                      {formatPercent(item.weekly_return)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
