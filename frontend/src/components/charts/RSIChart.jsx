import PropTypes from 'prop-types'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts'
import { COLORS } from '../../constants'

/**
 * RSI 차트 컴포넌트
 * @param {Object} props
 * @param {Array<{date: string, rsi: number|null}>} props.data - RSI 데이터
 */
export default function RSIChart({ data }) {
  // null 값을 가진 앞부분 제거
  const filteredData = data.filter(d => d.rsi !== null)

  if (filteredData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[150px] text-gray-400 dark:text-gray-500 text-sm">
        RSI 계산에 충분한 데이터가 없습니다
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart data={filteredData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: COLORS.CHART_AXIS }}
          tickFormatter={(v) => v.slice(5)} // MM-DD
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 30, 50, 70, 100]}
          tick={{ fontSize: 11, fill: COLORS.CHART_AXIS }}
          width={35}
        />
        <Tooltip
          formatter={(value) => [value.toFixed(1), 'RSI']}
          labelFormatter={(label) => label}
          contentStyle={{
            backgroundColor: 'var(--tooltip-bg, #fff)',
            border: '1px solid var(--tooltip-border, #e5e7eb)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--tooltip-color, #111827)',
          }}
          labelStyle={{ color: 'var(--tooltip-color, #111827)' }}
          itemStyle={{ color: 'var(--tooltip-color, #111827)' }}
        />

        {/* 과매도 영역 (0-30) */}
        <ReferenceArea y1={0} y2={30} fill={COLORS.RSI_OVERSOLD} fillOpacity={0.3} />
        {/* 과매수 영역 (70-100) */}
        <ReferenceArea y1={70} y2={100} fill={COLORS.RSI_OVERBOUGHT} fillOpacity={0.3} />

        {/* 기준선 */}
        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
        <ReferenceLine y={30} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={1} />
        <ReferenceLine y={50} stroke={COLORS.CHART_GRID} strokeDasharray="3 3" strokeWidth={1} />

        <Line
          type="monotone"
          dataKey="rsi"
          stroke={COLORS.RSI_LINE}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

RSIChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      rsi: PropTypes.number,
    })
  ).isRequired,
}
