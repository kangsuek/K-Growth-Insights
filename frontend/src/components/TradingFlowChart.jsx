import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts'
import { formatSigned } from '../utils/format'

// Net buy quantities per investor group. Positive = net buy, negative = net sell.
export default function TradingFlowChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="empty">매매동향 데이터가 없습니다.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
        <YAxis tickFormatter={formatSigned} tick={{ fontSize: 11 }} width={72} />
        <Tooltip formatter={(value, name) => [formatSigned(value), name]} />
        <Legend />
        <ReferenceLine y={0} stroke="#999" />
        <Bar dataKey="individual_net" name="개인" fill="#8c9bab" />
        <Bar dataKey="institutional_net" name="기관" fill="#f0a202" />
        <Bar dataKey="foreign_net" name="외국인" fill="#1f6feb" />
      </BarChart>
    </ResponsiveContainer>
  )
}
