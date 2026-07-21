import PropTypes from 'prop-types'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CHART_COLOR_PALETTE } from '../../constants'
import { formatPrice } from '../../utils/format'

/**
 * 포트폴리오 비중 파이차트
 */
export default function AllocationPieChart({ data }) {
  if (!data || data.length === 0) return null

  const renderCustomLabel = ({ name, percent }) => {
    if (percent < 5) return null
    return `${percent.toFixed(1)}%`
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 transition-colors">
      <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">포트폴리오 비중</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={100}
            dataKey="value"
            nameKey="name"
            label={renderCustomLabel}
            labelLine={false}
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [formatPrice(value), name]}
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
          <Legend
            formatter={(value) => (
              <span className="text-sm text-gray-700 dark:text-gray-300">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

AllocationPieChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      value: PropTypes.number.isRequired,
      percent: PropTypes.number.isRequired,
    })
  ).isRequired,
}
