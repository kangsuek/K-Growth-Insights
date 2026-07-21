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

export default function PortfolioSimulation() {
  const [holdings, setHoldings] = useState([{ ticker: '', weight: 100 }])
  const [amount, setAmount] = useState(10000000)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const { data: etfsData } = useQuery({
    queryKey: ['etfs'],
    queryFn: () => etfApi.getAll().then((r) => r.data),
  })
  const etfs = etfsData || []

  const mutation = useMutation({
    mutationFn: (params) => simulationApi.portfolio(params).then((r) => r.data),
  })

  const addHolding = () => {
    setHoldings([...holdings, { ticker: '', weight: 0 }])
  }

  const removeHolding = (idx) => {
    if (holdings.length <= 1) return
    setHoldings(holdings.filter((_, i) => i !== idx))
  }

  const updateHolding = (idx, field, value) => {
    const updated = [...holdings]
    updated[idx] = { ...updated[idx], [field]: value }
    setHoldings(updated)
  }

  // 비중 자동 균등 배분
  const equalizeWeights = () => {
    const w = Math.floor(100 / holdings.length)
    const remainder = 100 - w * holdings.length
    setHoldings(
      holdings.map((h, i) => ({ ...h, weight: i === 0 ? w + remainder : w }))
    )
  }

  const totalWeight = holdings.reduce((s, h) => s + Number(h.weight), 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!startDate || !endDate) return
    if (holdings.some((h) => !h.ticker)) return
    if (Math.abs(totalWeight - 100) > 1) return

    mutation.mutate({
      holdings: holdings.map((h) => ({
        ticker: h.ticker,
        weight: Number(h.weight) / 100,
      })),
      amount: Number(amount),
      start_date: startDate,
      end_date: endDate,
    })
  }

  const result = mutation.data
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-6">
      {/* 폼 */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        {/* 종목 + 비중 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">종목 구성</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={equalizeWeights}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                균등 배분
              </button>
              <button
                type="button"
                onClick={addHolding}
                className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                + 종목 추가
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {holdings.map((h, idx) => {
              const usedTickers = holdings.filter((_, i) => i !== idx).map((x) => x.ticker)
              return (
              <div key={idx} className="flex gap-2 items-center">
                <select
                  value={h.ticker}
                  onChange={(e) => updateHolding(idx, 'ticker', e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                  required
                >
                  <option value="">종목 선택</option>
                  {etfs.filter((etf) => !usedTickers.includes(etf.ticker)).map((etf) => (
                    <option key={etf.ticker} value={etf.ticker}>
                      {etf.name} ({etf.ticker})
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={h.weight}
                    onChange={(e) => updateHolding(idx, 'weight', e.target.value)}
                    min={1}
                    max={100}
                    className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm text-right"
                    required
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
                </div>
                {holdings.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeHolding(idx)}
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )})}
          </div>

          {/* 비중 합계 표시 */}
          <p className={`text-xs mt-2 ${Math.abs(totalWeight - 100) <= 1 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            비중 합계: {totalWeight}%{Math.abs(totalWeight - 100) > 1 && ' (100%가 되어야 합니다)'}
          </p>
        </div>

        {/* 금액, 기간, 실행 버튼 */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">총 투자금 (원)</label>
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
              disabled={mutation.isPending || Math.abs(totalWeight - 100) > 1}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <SummaryCard label="총 투자금" value={`${formatCurrency(result.total_invested)}원`} />
            <SummaryCard
              label="현재 평가액"
              value={`${formatCurrency(result.total_valuation)}원`}
              color={result.total_return_pct >= 0 ? 'red' : 'blue'}
            />
            <SummaryCard
              label="포트폴리오 수익률"
              value={formatPercent(result.total_return_pct)}
              color={result.total_return_pct >= 0 ? 'red' : 'blue'}
            />
          </div>

          {/* 종목별 결과 테이블 */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">종목별 결과</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">종목</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">비중</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">배정금</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">매수가</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">주수</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">현재가</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">평가액</th>
                  <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">수익률</th>
                </tr>
              </thead>
              <tbody>
                {result.holdings_result.map((row) => (
                  <tr key={row.ticker} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2 px-2">
                      <div className="text-gray-900 dark:text-gray-100 font-medium">{row.name}</div>
                      <div className="text-xs text-gray-400">{row.ticker}</div>
                    </td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{(row.weight * 100).toFixed(0)}%</td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.allocated)}</td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.buy_price)}</td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{row.shares}</td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.current_price)}</td>
                    <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{formatCurrency(row.current_valuation)}</td>
                    <td className={`py-2 px-2 text-right font-medium ${row.return_pct >= 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                      {formatPercent(row.return_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 포트폴리오 가치 추이 차트 */}
          {result.daily_series.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">포트폴리오 가치 추이</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={result.daily_series}>
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
                  <ReferenceLine
                    y={result.total_invested}
                    stroke={COLORS.CHART_AXIS}
                    strokeDasharray="3 3"
                    label={{ value: '투자금', fill: COLORS.CHART_AXIS, fontSize: 11 }}
                  />
                  <Line type="monotone" dataKey="valuation" stroke={COLORS.CHART_PRIMARY} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
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
