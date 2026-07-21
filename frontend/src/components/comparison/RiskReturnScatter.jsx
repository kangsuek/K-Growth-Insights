import { useMemo } from 'react'
import PropTypes from 'prop-types'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  ReferenceLine,
} from 'recharts'
import { CHART_COLOR_PALETTE } from '../../constants'

/**
 * RiskReturnScatter Component
 *
 * 위험-수익 산점도
 * - X축: 변동성 (volatility) = 위험
 * - Y축: 기간 수익률 (period_return) = 수익
 * - 오른쪽 위 = 고수익·고위험, 왼쪽 위 = 고수익·저위험(이상적)
 *
 * @param {Object} statistics - { ticker: { period_return, volatility, ... } }
 * @param {Object} tickerInfo - { ticker: { name, ... } }
 */
export default function RiskReturnScatter({ statistics = null, tickerInfo = {} }) {
  const scatterData = useMemo(() => {
    if (!statistics) return []

    return Object.entries(statistics).map(([ticker, stats], index) => ({
      ticker,
      name: tickerInfo[ticker]?.name || ticker,
      volatility: stats.volatility ?? 0,
      periodReturn: stats.period_return ?? 0,
      color: CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length],
    }))
  }, [statistics, tickerInfo])

  // 축 중앙값 계산 (사분면 기준선)
  const axisMiddle = useMemo(() => {
    if (scatterData.length === 0) return { x: 0, y: 0 }

    const avgVolatility = scatterData.reduce((sum, d) => sum + d.volatility, 0) / scatterData.length
    const avgReturn = scatterData.reduce((sum, d) => sum + d.periodReturn, 0) / scatterData.length

    return { x: avgVolatility, y: avgReturn }
  }, [scatterData])

  if (!statistics || Object.keys(statistics).length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          위험-수익 산점도
        </h3>
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          데이터가 없습니다
        </div>
      </div>
    )
  }

  // 커스텀 툴팁
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            {data.name}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            수익률: <span className={`font-medium ${
              data.periodReturn >= 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
            }`}>
              {data.periodReturn >= 0 ? '+' : ''}{data.periodReturn.toFixed(2)}%
            </span>
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            변동성: <span className="font-medium text-gray-900 dark:text-white">
              {data.volatility.toFixed(2)}%
            </span>
          </p>
        </div>
      )
    }
    return null
  }

  // 커스텀 도트 (각 종목별 색상)
  const CustomDot = (props) => {
    const { cx, cy, payload } = props
    return (
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={payload.color}
        stroke="#fff"
        strokeWidth={2}
        className="drop-shadow-sm"
      />
    )
  }

  // 커스텀 라벨 렌더러
  const renderCustomLabel = (props) => {
    const { x, y, value } = props
    return (
      <text
        x={x}
        y={y - 14}
        textAnchor="middle"
        className="fill-gray-700 dark:fill-gray-300 text-xs font-medium"
        style={{ fontSize: '11px' }}
      >
        {value}
      </text>
    )
  }

  return (
    <div className="card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          위험-수익 산점도
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          X축: 변동성(위험), Y축: 기간 수익률(수익)
        </p>
      </div>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              type="number"
              dataKey="volatility"
              name="변동성"
              unit="%"
              tick={{ fontSize: 12, fill: 'currentColor' }}
              label={{
                value: '변동성 (위험) →',
                position: 'insideBottom',
                offset: -10,
                style: { fontSize: 12, fill: '#6b7280' },
              }}
            />
            <YAxis
              type="number"
              dataKey="periodReturn"
              name="수익률"
              unit="%"
              tick={{ fontSize: 12, fill: 'currentColor' }}
              label={{
                value: '수익률 (수익) →',
                angle: -90,
                position: 'insideLeft',
                offset: 10,
                style: { fontSize: 12, fill: '#6b7280' },
              }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />

            {/* 평균 기준선 (사분면 구분) */}
            <ReferenceLine
              x={axisMiddle.x}
              stroke="#9ca3af"
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <ReferenceLine
              y={axisMiddle.y}
              stroke="#9ca3af"
              strokeDasharray="5 5"
              strokeWidth={1}
            />

            <Scatter
              data={scatterData}
              shape={<CustomDot />}
            >
              <LabelList dataKey="name" content={renderCustomLabel} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* 사분면 설명 */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-900/10 rounded">
          <span className="font-bold text-green-600 dark:text-green-400 shrink-0">◀ ▲</span>
          <span className="text-green-700 dark:text-green-300">
            <span className="font-semibold">저위험·고수익</span> (이상적)
          </span>
        </div>
        <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/10 rounded">
          <span className="font-bold text-yellow-600 dark:text-yellow-400 shrink-0">▶ ▲</span>
          <span className="text-yellow-700 dark:text-yellow-300">
            <span className="font-semibold">고위험·고수익</span>
          </span>
        </div>
        <div className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
          <span className="font-bold text-gray-500 dark:text-gray-400 shrink-0">◀ ▼</span>
          <span className="text-gray-600 dark:text-gray-400">
            <span className="font-semibold">저위험·저수익</span>
          </span>
        </div>
        <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/10 rounded">
          <span className="font-bold text-red-500 dark:text-red-400 shrink-0">▶ ▼</span>
          <span className="text-red-700 dark:text-red-300">
            <span className="font-semibold">고위험·저수익</span> (비효율적)
          </span>
        </div>
      </div>
    </div>
  )
}

RiskReturnScatter.propTypes = {
  statistics: PropTypes.object,
  tickerInfo: PropTypes.object.isRequired,
}
