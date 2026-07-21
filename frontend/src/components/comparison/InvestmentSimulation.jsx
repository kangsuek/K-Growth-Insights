import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import PropTypes from 'prop-types'

const INVESTMENT_AMOUNT = 1000000 // 기준 투자금 100만원

/**
 * InvestmentSimulation Component
 *
 * 투자 시뮬레이션 카드 + 한줄 요약
 * - 한줄 요약: 최고 수익 종목, 가장 안정적 종목(변동성 최저) 자동 추출
 * - 투자 시뮬레이션 카드: 기준 100만원 고정, 종목별 평가액·수익률 표시
 *
 * @param {Object} statistics - { ticker: { period_return, volatility, ... } }
 * @param {Object} tickerInfo - { ticker: { name, ... } }
 */
export default function InvestmentSimulation({ statistics = null, tickerInfo = {} }) {
  // 시뮬레이션 데이터 계산
  const simulationData = useMemo(() => {
    if (!statistics) return []

    return Object.entries(statistics)
      .map(([ticker, stats]) => {
        const periodReturn = stats.period_return ?? 0
        const volatility = stats.volatility ?? 0
        const evaluatedAmount = INVESTMENT_AMOUNT * (1 + periodReturn / 100)
        const profit = evaluatedAmount - INVESTMENT_AMOUNT

        return {
          ticker,
          name: tickerInfo[ticker]?.name || ticker,
          periodReturn,
          volatility,
          evaluatedAmount,
          profit,
        }
      })
      .sort((a, b) => b.periodReturn - a.periodReturn) // 수익률 높은 순 정렬
  }, [statistics, tickerInfo])

  // 한줄 요약: 최고 수익 종목, 가장 안정적 종목
  const summary = useMemo(() => {
    if (simulationData.length === 0) return null

    const bestReturn = simulationData[0] // 이미 수익률 내림차순 정렬
    const mostStable = [...simulationData].sort((a, b) => a.volatility - b.volatility)[0]

    return { bestReturn, mostStable }
  }, [simulationData])

  if (!statistics || Object.keys(statistics).length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          투자 시뮬레이션
        </h3>
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          데이터가 없습니다
        </div>
      </div>
    )
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ko-KR').format(Math.round(value))
  }

  const formatPercent = (value) => {
    const formatted = value.toFixed(2)
    return value >= 0 ? `+${formatted}%` : `${formatted}%`
  }

  return (
    <div className="card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          투자 시뮬레이션
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {formatCurrency(INVESTMENT_AMOUNT)}원 투자 시 예상 수익
        </p>
      </div>

      {/* 한줄 요약 */}
      {summary && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <span className="font-semibold">이 기간 최고 수익:</span>{' '}
            <span className="font-bold text-red-600 dark:text-red-400">
              {summary.bestReturn.name} ({formatPercent(summary.bestReturn.periodReturn)})
            </span>
            <span className="mx-2 text-blue-400">|</span>
            <span className="font-semibold">가장 안정적:</span>{' '}
            <span className="font-bold text-green-600 dark:text-green-400">
              {summary.mostStable.name} (변동성 {summary.mostStable.volatility.toFixed(2)}%)
            </span>
          </p>
        </div>
      )}

      {/* 투자 시뮬레이션 카드 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {simulationData.map((item, index) => {
          const isProfit = item.profit >= 0

          return (
            <div
              key={item.ticker}
              className={`relative p-4 rounded-lg border transition-shadow hover:shadow-md ${
                index === 0
                  ? 'border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/10'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
              }`}
            >
              {/* 1등 배지 */}
              {index === 0 && (
                <div className="absolute -top-2 -right-2 bg-yellow-400 dark:bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">
                  1st
                </div>
              )}

              {/* 종목명 */}
              <div className="mb-3">
                <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
                  {item.name}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.ticker}</p>
              </div>

              {/* 투자금 → 평가액 */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">투자금</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {formatCurrency(INVESTMENT_AMOUNT)}원
                </span>
              </div>
              <div className="flex items-center justify-center text-gray-400 dark:text-gray-500 my-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">평가액</span>
                <span className={`text-sm font-bold ${
                  isProfit ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
                }`}>
                  {formatCurrency(item.evaluatedAmount)}원
                </span>
              </div>

              {/* 수익/손실 */}
              <div className={`flex items-center justify-between pt-3 border-t ${
                index === 0
                  ? 'border-yellow-200 dark:border-yellow-700'
                  : 'border-gray-100 dark:border-gray-700'
              }`}>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {isProfit ? '수익' : '손실'}
                </span>
                <div className="text-right">
                  <span className={`text-sm font-bold ${
                    isProfit ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
                  }`}>
                    {isProfit ? '+' : ''}{formatCurrency(item.profit)}원
                  </span>
                  <span className={`ml-2 text-xs font-semibold ${
                    isProfit ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
                  }`}>
                    ({formatPercent(item.periodReturn)})
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 안내 텍스트 + 상세 시뮬레이션 링크 */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          * 시뮬레이션은 과거 기간 수익률 기반이며, 미래 수익을 보장하지 않습니다
        </p>
        <Link
          to="/simulation"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          상세 시뮬레이션
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  )
}

InvestmentSimulation.propTypes = {
  statistics: PropTypes.object,
  tickerInfo: PropTypes.object.isRequired,
}
