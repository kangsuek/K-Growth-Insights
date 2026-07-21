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

// 최근 세션의 분봉 차트: 체결가(선) + 분당 거래량(막대).
export default function IntradayChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="empty">분봉 데이터가 없습니다. (장중이 아니거나 미수집)</div>
  }

  // datetime("2026-07-21T09:00:00")에서 시:분만 X축 라벨로 사용.
  const rows = data.map((d) => ({ ...d, time: d.datetime.slice(11, 16) }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={40} />
        <YAxis
          yAxisId="price"
          tickFormatter={formatNumber}
          tick={{ fontSize: 11 }}
          domain={['auto', 'auto']}
          width={64}
        />
        <YAxis yAxisId="vol" orientation="right" hide domain={[0, 'dataMax']} />
        <Tooltip formatter={(value, name) => [formatNumber(value), name]} />
        <Legend />
        <Bar yAxisId="vol" dataKey="volume" name="거래량" fill="#ffe1c4" />
        <Line
          yAxisId="price"
          type="monotone"
          dataKey="price"
          name="체결가"
          stroke="#e8590c"
          strokeWidth={1.6}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
