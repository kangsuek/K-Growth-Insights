import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { marketApi } from '../../services/api'
import { format } from 'date-fns'

const PERIODS = [
  { value: '1M', label: '1개월' },
  { value: '3M', label: '3개월' },
  { value: '6M', label: '6개월' },
  { value: '1Y', label: '1년' },
  { value: '3Y', label: '3년' },
]

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">
        {d.date ? format(new Date(d.date), 'yyyy-MM-dd') : ''}
      </p>
      <p className="text-gray-900 dark:text-gray-100 font-bold">
        {d.close != null ? d.close.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
      </p>
    </div>
  )
}

export default function MarketIndexModal({ index, onClose }) {
  const [period, setPeriod] = useState('3M')
  const overlayRef = useRef(null)

  const isPositive = index.change >= 0
  const lineColor = isPositive ? '#ef4444' : '#3b82f6'
  const areaColor = isPositive ? '#fecaca' : '#bfdbfe'
  const darkAreaColor = isPositive ? '#7f1d1d' : '#1e3a5f'

  const { data, isLoading } = useQuery({
    queryKey: ['market-index-chart', index.code, period],
    queryFn: async () => {
      const res = await marketApi.getIndexChart(index.code, period)
      return res.data
    },
    staleTime: 5 * 60 * 1000,
  })

  // ESC 닫기
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // 오버레이 클릭 닫기
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose()
  }

  const chartData = data?.data ?? []
  const firstClose = chartData[0]?.close
  const lastClose = chartData[chartData.length - 1]?.close
  const periodChange = firstClose && lastClose ? lastClose - firstClose : null
  const periodChangePct = firstClose && lastClose ? ((lastClose - firstClose) / firstClose) * 100 : null

  const minVal = chartData.length ? Math.min(...chartData.map(d => d.close).filter(Boolean)) : 0
  const maxVal = chartData.length ? Math.max(...chartData.map(d => d.close).filter(Boolean)) : 0
  const padding = (maxVal - minVal) * 0.05
  const yDomain = [minVal - padding, maxVal + padding]

  // X축 라벨 간격 조정
  const tickInterval = Math.max(1, Math.floor(chartData.length / 6))

  const changeSign = index.change >= 0 ? '+' : ''
  const periodSign = periodChange != null && periodChange >= 0 ? '+' : ''

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{index.name}</h2>
            <div className="flex items-baseline gap-3 mt-0.5">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {index.close_price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`text-sm font-semibold ${isPositive ? 'text-red-500' : 'text-blue-500'}`}>
                {changeSign}{index.change.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {' '}({changeSign}{index.change_ratio.toFixed(2)}%)
              </span>
            </div>
            {periodChangePct != null && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                기간 변화:
                <span className={`ml-1 font-semibold ${periodChange >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                  {periodSign}{periodChangePct.toFixed(2)}%
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 기간 선택 */}
        <div className="flex gap-1 px-5 pb-3">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                period === p.value
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 차트 */}
        <div className="px-2 pb-5" style={{ height: 280 }}>
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              데이터 없음
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${index.code}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={lineColor} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={lineColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => {
                    const d = new Date(v)
                    return period === '3Y'
                      ? `${String(d.getFullYear()).slice(2)}/${d.getMonth() + 1}/${d.getDate()}`
                      : `${d.getMonth() + 1}/${d.getDate()}`
                  }}
                  interval={tickInterval}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={yDomain}
                  tickFormatter={(v) => v.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={58}
                />
                <Tooltip content={<CustomTooltip />} />
                {firstClose && (
                  <ReferenceLine
                    y={firstClose}
                    stroke="rgba(156,163,175,0.5)"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={lineColor}
                  strokeWidth={2}
                  fill={`url(#grad-${index.code})`}
                  dot={false}
                  activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
