import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { formatNumber } from '../utils/format'

export default function PriceChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="empty">가격 데이터가 없습니다.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
        <YAxis
          yAxisId="price"
          tickFormatter={formatNumber}
          tick={{ fontSize: 11 }}
          domain={['auto', 'auto']}
          width={64}
        />
        <YAxis yAxisId="vol" orientation="right" hide domain={[0, 'dataMax']} />
        <Tooltip
          formatter={(value, name) => [formatNumber(value), name]}
          labelStyle={{ fontWeight: 600 }}
        />
        <Legend />
        <Bar yAxisId="vol" dataKey="volume" name="거래량" fill="#d7e3ff" />
        <Line
          yAxisId="price"
          type="monotone"
          dataKey="close_price"
          name="종가"
          stroke="#1f6feb"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
