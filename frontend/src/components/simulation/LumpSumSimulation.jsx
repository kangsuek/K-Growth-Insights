import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { simulationApi, etfApi } from '../../services/api'
import { COLORS } from '../../constants'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

const formatCurrency = (v) => new Intl.NumberFormat('ko-KR').format(Math.round(v))
const formatPercent = (v) => (v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`)
const toComma = (v) => v ? Number(v).toLocaleString('ko-KR') : ''
const fromComma = (s) => s.replace(/,/g, '')

export default function LumpSumSimulation() {
  const [ticker, setTicker] = useState('')
  const [buyDate, setBuyDate] = useState('')
  const [amount, setAmount] = useState(1000000)

  const { data: etfsData } = useQuery({
    queryKey: ['etfs'],
    queryFn: () => etfApi.getAll().then((r) => r.data),
  })
  const etfs = etfsData || []

  const mutation = useMutation({
    mutationFn: (params) => simulationApi.lumpSum(params).then((r) => r.data),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!ticker || !buyDate || !amount) return
    mutation.mutate({ ticker, buy_date: buyDate, amount: Number(amount) })
  }

  const result = mutation.data
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-6">
      {/* 폼 */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">매수일</label>
            <input
              type="date"
              value={buyDate}
              onChange={(e) => setBuyDate(e.target.value)}
              max={today}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">투자금 (원)</label>
            <input
              type="text"
              inputMode="numeric"
              value={toComma(amount)}
              onChange={(e) => {
                const raw = fromComma(e.target.value)
                if (/^\d*$/.test(raw)) setAmount(raw ? Number(raw) : '')
              }}
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
          <p className="text-sm text-gray-500 dark:text-gray-400">데이터 수집 및 분석 중... (최초 실행 시 시간이 걸릴 수 있습니다)</p>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryCard
              label="투자금"
              value={`${formatCurrency(result.total_invested)}원`}
            />
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
            <SummaryCard
              label="매수 주수"
              value={`${result.shares}주`}
              sub={`잔여금 ${formatCurrency(result.remainder)}원`}
            />
          </div>

          {/* 최대 수익/손실 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">기간 내 최대 수익</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatPercent(result.max_gain.return_pct)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{result.max_gain.date} (주가 {formatCurrency(result.max_gain.price)}원)</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">기간 내 최대 손실</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatPercent(result.max_loss.return_pct)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{result.max_loss.date} (주가 {formatCurrency(result.max_loss.price)}원)</p>
            </div>
          </div>

          {/* 차트 */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              {result.name} 평가액 추이
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={result.price_series}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: COLORS.CHART_AXIS }}
                  tickFormatter={(v) => v.slice(5)} // MM-DD
                />
                <YAxis
                  tick={{ fontSize: 11, fill: COLORS.CHART_AXIS }}
                  tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
                />
                <Tooltip
                  formatter={(v, name) => {
                    if (name === 'valuation') return [`${formatCurrency(v)}원`, '평가액']
                    if (name === 'return_pct') return [`${v}%`, '수익률']
                    return [v, name]
                  }}
                  labelFormatter={(l) => `날짜: ${l}`}
                  contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid var(--tooltip-border, #e5e7eb)', borderRadius: '8px', fontSize: '12px' }}
                />
                <ReferenceLine y={result.total_invested} stroke={COLORS.CHART_AXIS} strokeDasharray="3 3" label={{ value: '투자금', fill: COLORS.CHART_AXIS, fontSize: 11 }} />
                <Line type="monotone" dataKey="valuation" stroke={COLORS.CHART_PRIMARY} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color, sub }) {
  const colorClass =
    color === 'red' ? 'text-red-600 dark:text-red-400' :
    color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
    'text-gray-900 dark:text-gray-100'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}
