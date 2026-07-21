import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { marketApi } from '../../services/api'
import MarketIndexModal from './MarketIndexModal'

/**
 * 개별 지수 카드 컴포넌트
 */
const IndexCard = ({ index, onClick }) => {
  const isPositive = index.change > 0
  const isNegative = index.change < 0

  const changeColor = isPositive
    ? 'text-red-600 dark:text-red-400'
    : isNegative
    ? 'text-blue-600 dark:text-blue-400'
    : 'text-gray-500 dark:text-gray-400'

  const bgColor = isPositive
    ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800/30'
    : isNegative
    ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30'
    : 'bg-gray-50 dark:bg-gray-700 border-gray-100 dark:border-gray-600'

  const changeSign = isPositive ? '+' : ''

  return (
    <button
      onClick={() => onClick(index)}
      className={`flex items-center justify-between px-4 py-2.5 rounded-lg border ${bgColor} w-full text-left hover:brightness-95 dark:hover:brightness-110 transition-all cursor-pointer`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{index.name}</span>
        <svg className="w-3 h-3 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {index.close_price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className={`text-xs font-semibold ${changeColor}`}>
          {changeSign}{index.change.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          {' '}
          ({changeSign}{index.change_ratio.toFixed(2)}%)
        </span>
      </div>
    </button>
  )
}

/**
 * MarketOverview 컴포넌트
 * KOSPI / KOSDAQ 지수 현황을 대시보드 상단에 표시합니다.
 * 카드 클릭 시 지수 차트 팝업을 표시합니다.
 */
export default function MarketOverview() {
  const [selectedIndex, setSelectedIndex] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['market-overview'],
    queryFn: async () => {
      const response = await marketApi.getOverview()
      return response.data
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="mb-4 flex gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex-1 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError || !data?.indices || data.indices.length === 0) {
    return null
  }

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">시장 현황</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {data.indices.map((index) => (
            <IndexCard key={index.code} index={index} onClick={setSelectedIndex} />
          ))}
        </div>
      </div>

      {selectedIndex && (
        <MarketIndexModal
          index={selectedIndex}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </>
  )
}
