import PropTypes from 'prop-types'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { COLORS } from '../../constants'

/**
 * 포트폴리오 수익률 추이 차트
 */
export default function PortfolioTrendChart({ data }) {
  if (!data || data.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 transition-colors">
      <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">수익률 추이</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="portfolioGradientPos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.PRICE_UP} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.PRICE_UP} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="portfolioGradientNeg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.PRICE_DOWN} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.PRICE_DOWN} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: COLORS.CHART_AXIS }}
            tickFormatter={(v) => v.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: COLORS.CHART_AXIS }}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            width={55}
          />
          <Tooltip
            formatter={(value) => [`${value.toFixed(2)}%`, '수익률']}
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
          <ReferenceLine y={0} stroke={COLORS.CHART_GRID} strokeWidth={1.5} />
          <Area
            type="monotone"
            dataKey="returnPct"
            stroke={data[data.length - 1]?.returnPct >= 0 ? COLORS.PRICE_UP : COLORS.PRICE_DOWN}
            fill={data[data.length - 1]?.returnPct >= 0 ? 'url(#portfolioGradientPos)' : 'url(#portfolioGradientNeg)'}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

PortfolioTrendChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      returnPct: PropTypes.number.isRequired,
    })
  ).isRequired,
}
