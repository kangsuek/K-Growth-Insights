import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { simulationApi, etfApi } from '../../services/api'
import { COLORS } from '../../constants'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

const formatCurrency = (v) => new Intl.NumberFormat('ko-KR').format(Math.round(v))
const formatPercent = (v) => (v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`)
const toComma = (v) => v ? Number(v).toLocaleString('ko-KR') : ''
const fromComma = (s) => s.replace(/,/g, '')

export default function DCASimulation() {
  const [ticker, setTicker] = useState('')
  const [monthlyAmount, setMonthlyAmount] = useState(500000)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [buyDay, setBuyDay] = useState(1)

  const { data: etfsData } = useQuery({
    queryKey: ['etfs'],
    queryFn: () => etfApi.getAll().then((r) => r.data),
  })
  const etfs = etfsData || []

  const mutation = useMutation({
    mutationFn: (params) => simulationApi.dca(params).then((r) => r.data),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!ticker || !startDate || !endDate) return
    mutation.mutate({
      ticker,
      monthly_amount: Number(monthlyAmount),
      start_date: startDate,
      end_date: endDate,
      buy_day: Number(buyDay),
    })
  }

  const result = mutation.data
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-6">
      {/* 폼 */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">종목</label>
            <select
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
              required
            >
              <option value="">선택하세요</option>
              {etfs.map((etf) => (
                <option key={etf.ticker} value={etf.ticker}>
                  {etf.name} ({etf.ticker})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">월 투자금 (원)</label>
            <input
              type="text"
              inputMode="numeric"
              value={toComma(monthlyAmount)}
              onChange={(e) => {
                const raw = fromComma(e.target.value)
                if (/^\d*$/.test(raw)) setMonthlyAmount(raw ? Number(raw) : '')
              }}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">매수일 (매월)</label>
            <select
              value={buyDay}
              onChange={(e) => setBuyDay(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}일</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              max={today}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              max={today}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {mutation.isPending ? '분석 중...' : '시뮬레이션'}
            </button>
          </div>
        </div>
      </form>

      {/* 에러 */}
      {mutation.isError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{mutation.error?.response?.data?.detail || mutation.error?.message || '시뮬레이션 실행 실패'}</p>
        </div>
      )}

      {/* 로딩 */}
      {mutation.isPending && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">데이터 수집 및 분석 중...</p>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <SummaryCard label="총 투자금" value={`${formatCurrency(result.total_invested)}원`} />
            <SummaryCard
              label="현재 평가액"
              value={`${formatCurrency(result.total_valuation)}원`}
              color={result.total_return_pct >= 0 ? 'red' : 'blue'}
            />
            <SummaryCard
              label="수익률"
              value={formatPercent(result.total_return_pct)}
              color={result.total_return_pct >= 0 ? 'red' : 'blue'}
            />
            <SummaryCard label="평균 매수가" value={`${formatCurrency(result.avg_buy_price)}원`} />
            <SummaryCard label="총 보유 주수" value={`${result.total_shares}주`} />
          </div>

          {/* 차트 */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              {result.name} 누적 투자금 vs 평가액
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={result.monthly_data}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: COLORS.CHART_AXIS }}
                  tickFormatter={(v) => v.slice(2, 7)} // YY-MM
                />
                <YAxis
                  tick={{ fontSize: 11, fill: COLORS.CHART_AXIS }}
                  tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
                />
                <Tooltip
                  formatter={(v, name) => {
                    const label = name === 'cumulative_invested' ? '누적 투자금' : '평가액'
                    return [`${formatCurrency(v)}원`, label]
                  }}
                  labelFormatter={(l) => `날짜: ${l}`}
                  contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid var(--tooltip-border, #e5e7eb)', borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend formatter={(v) => v === 'cumulative_invested' ? '누적 투자금' : '평가액'} />
                <Area
                  type="monotone"
                  dataKey="cumulative_invested"
                  stroke={COLORS.CHART_AXIS}
                  fill={COLORS.CHART_GRID}
                  strokeWidth={2}
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative_valuation"
                  stroke={COLORS.CHART_PRIMARY}
                  fill={COLORS.CHART_PRIMARY}
                  strokeWidth={2}
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 월별 상세 테이블 */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">월별 매수 내역</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">날짜</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">매수가</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">매수 주수</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">누적 주수</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">누적 투자금</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">평가액</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">수익률</th>
                </tr>
              </thead>
              <tbody>
                {result.monthly_data.map((row) => (
                  <tr key={row.date} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2 px-2 text-gray-700 dark:text-gray-300">{row.date}</td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.buy_price)}</td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{row.shares_bought}</td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{row.cumulative_shares}</td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.cumulative_invested)}</td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.cumulative_valuation)}</td>
                    <td className={`py-2 px-2 text-right font-medium ${row.return_pct >= 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                      {formatPercent(row.return_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  const colorClass =
    color === 'red' ? 'text-red-600 dark:text-red-400' :
    color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
    'text-gray-900 dark:text-gray-100'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${colorClass}`}>{value}</p>
    </div>
  )
}
