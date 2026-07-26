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

  // 매수 후 거래일이 1일뿐이면 선을 그릴 수 없다. 빈 차트를 보여주는 대신 이유를 알린다.
  if (data.length < 2) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 transition-colors">
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">수익률 추이</h3>
        <div className="py-10 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            매수 후 거래일이 하루뿐이라 추이를 그릴 수 없습니다.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            기준일 {data[0].date} · 수익률 {data[0].returnPct.toFixed(2)}%
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 transition-colors">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">수익률 추이</h3>
        {/* 추이는 보유 종목 전체에 시세가 있는 날짜만 쓴다(일부만 있는 날짜를 넣으면
            포트폴리오 가치가 작게 잡혀 수익률이 왜곡된다). 신규 상장 종목이 있으면
            구간이 짧아지므로 기준 일수를 함께 보여준다. */}
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {data[0].date} ~ {data[data.length - 1].date} ({data.length.toLocaleString('ko-KR')}거래일)
        </span>
      </div>
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
