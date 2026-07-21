import PropTypes from 'prop-types'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { CHART_COLOR_PALETTE } from '../../constants'

/**
 * NormalizedPriceChart Component
 *
 * 정규화된 가격 차트 (시작일 = 100)
 *
 * @param {Object} data - { dates: [], data: { ticker: [100, ...] } }
 * @param {Object} tickerInfo - { ticker: { name, ... } }
 * @param {Object} statistics - { ticker: { period_return, ... } }
 */
export default function NormalizedPriceChart({ data = null, tickerInfo = {}, statistics = null }) {
  if (!data || !data.dates || data.dates.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          정규화 가격 추이
        </h3>
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          데이터가 없습니다
        </div>
      </div>
    )
  }

  // 차트용 데이터 변환
  const chartData = data.dates.map((date, idx) => {
    const dataPoint = { date }

    if (data.data && typeof data.data === 'object') {
      Object.keys(data.data).forEach(ticker => {
        const tickerData = data.data[ticker]
        if (Array.isArray(tickerData) && idx < tickerData.length) {
          const value = tickerData[idx]
          if (value !== null && value !== undefined) {
            dataPoint[ticker] = value
          }
        }
      })
    }

    return dataPoint
  })

  // 티커별 색상 (최대 6개)
  const colors = CHART_COLOR_PALETTE

  // 수익률 순으로 티커 정렬 (높은 수익률부터)
  const tickers = data.data && typeof data.data === 'object' 
    ? Object.keys(data.data).sort((a, b) => {
        if (!statistics) return 0
        const returnA = statistics[a]?.period_return ?? -Infinity
        const returnB = statistics[b]?.period_return ?? -Infinity
        return returnB - returnA // 내림차순
      })
    : []

  // X축 날짜 포맷팅
  const formatXAxis = (dateStr) => {
    try {
      return format(parseISO(dateStr), 'M/d')
    } catch {
      return dateStr
    }
  }

  // 툴팁 커스텀
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length > 0) {
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            {format(parseISO(label), 'yyyy-MM-dd')}
          </p>
          {payload.map((entry, index) => {
            const ticker = entry.dataKey
            const value = entry.value
            const change = ((value - 100) / 100 * 100).toFixed(2)
            const name = tickerInfo[ticker]?.name || ticker

            return (
              <div key={index} className="flex items-center justify-between gap-4 text-xs">
                <span style={{ color: entry.color }} className="font-medium">
                  {name}
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  {value.toFixed(2)}
                  <span className={`ml-2 ${
                    change >= 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
                  }`}>
                    ({change >= 0 ? '+' : ''}{change}%)
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )
    }
    return null
  }

  // 범례 커스텀
  const CustomLegend = ({ payload }) => {
    return (
      <div className="flex flex-wrap justify-center gap-3 mt-4">
        {payload.map((entry, index) => {
          const ticker = entry.value
          const name = tickerInfo[ticker]?.name || ticker
          const tickerData = data.data && data.data[ticker]
          const lastValue = Array.isArray(tickerData) && tickerData.length > 0 
            ? tickerData[tickerData.length - 1] 
            : null
          const change = lastValue ? ((lastValue - 100) / 100 * 100).toFixed(2) : 0

          return (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg"
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs font-medium text-gray-900 dark:text-white">
                {name}
              </span>
              <span className={`text-xs font-semibold ${
                change >= 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
              }`}>
                {change >= 0 ? '+' : ''}{change}%
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          정규화 가격 추이
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          시작일 기준 100으로 정규화된 가격 비교 (기간 수익률 기준)
        </p>
      </div>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxis}
              className="text-xs text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor' }}
            />
            <YAxis
              className="text-xs text-gray-600 dark:text-gray-400"
              tick={{ fill: 'currentColor' }}
              label={{ value: '정규화 가격', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
            {tickers.map((ticker, idx) => (
              <Line
                key={ticker}
                type="monotone"
                dataKey={ticker}
                stroke={colors[idx % colors.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

NormalizedPriceChart.propTypes = {
  data: PropTypes.shape({
    dates: PropTypes.arrayOf(PropTypes.string).isRequired,
    data: PropTypes.object.isRequired,
  }),
  tickerInfo: PropTypes.object.isRequired,
  statistics: PropTypes.object,
}

