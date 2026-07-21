import PropTypes from 'prop-types'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { COLORS } from '../../constants'

/**
 * MACD 차트 컴포넌트
 * @param {Object} props
 * @param {Array<{date: string, macd: number|null, signal: number|null, histogram: number|null}>} props.data
 */
export default function MACDChart({ data }) {
  // null 값을 가진 앞부분 제거
  const filteredData = data.filter(d => d.macd !== null && d.signal !== null)

  if (filteredData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-gray-400 dark:text-gray-500 text-sm">
        MACD 계산에 충분한 데이터가 없습니다
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={filteredData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: COLORS.CHART_AXIS }}
          tickFormatter={(v) => v.slice(5)} // MM-DD
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: COLORS.CHART_AXIS }}
          width={50}
          tickFormatter={(v) => v.toFixed(0)}
        />
        <Tooltip
          formatter={(value, name) => {
            const labels = { macd: 'MACD', signal: 'Signal', histogram: 'Histogram' }
            return [value.toFixed(2), labels[name] || name]
          }}
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

        {/* 0 기준선 */}
        <ReferenceLine y={0} stroke={COLORS.CHART_GRID} strokeWidth={1} />

        {/* 히스토그램 (양수: 빨강, 음수: 파랑) */}
        <Bar dataKey="histogram" barSize={4}>
          {filteredData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.histogram >= 0 ? COLORS.MACD_HIST_POS : COLORS.MACD_HIST_NEG}
              fillOpacity={0.7}
            />
          ))}
        </Bar>

        {/* MACD 라인 */}
        <Line
          type="monotone"
          dataKey="macd"
          stroke={COLORS.MACD_LINE}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />

        {/* Signal 라인 */}
        <Line
          type="monotone"
          dataKey="signal"
          stroke={COLORS.MACD_SIGNAL}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

MACDChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      macd: PropTypes.number,
      signal: PropTypes.number,
      histogram: PropTypes.number,
    })
  ).isRequired,
}
