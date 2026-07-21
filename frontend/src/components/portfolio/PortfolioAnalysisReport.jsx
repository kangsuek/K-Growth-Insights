import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import PropTypes from 'prop-types'
import { generatePortfolioReport } from '../../utils/portfolioAnalysis'
import { formatPercent, getPriceChangeColor } from '../../utils/format'

/**
 * 액션 라벨 색상
 */
const ACTION_STYLES = {
  stop_loss: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  trim: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  buy: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  hold: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
}

const SEVERITY_BORDER = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-400',
  low: 'border-l-gray-300 dark:border-l-gray-600',
}

const STATUS_BADGE = {
  profit: { label: '양호', className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
  slight_loss: { label: '소폭 손실', className: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
  warning: { label: '주의', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  danger: { label: '위험', className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
}

const FLOW_BADGE = {
  positive: { label: '매수', className: 'text-green-600 dark:text-green-400' },
  negative: { label: '매도', className: 'text-red-500 dark:text-red-400' },
  neutral: { label: '혼조', className: 'text-gray-500 dark:text-gray-400' },
}

export default function PortfolioAnalysisReport({
  investedETFs,
  trackingETFs,
  batchSummary,
  allocation,
  contributions,
  summary,
}) {
  const report = useMemo(
    () => generatePortfolioReport({ investedETFs, trackingETFs, batchSummary, allocation, contributions, summary }),
    [investedETFs, trackingETFs, batchSummary, allocation, contributions, summary]
  )

  if (!report) return null

  const { diagnosis, watchedStockAnalysis, adjustmentSuggestions, holdingsHealth } = report

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* A. 면책 배너 */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
        <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          본 분석은 수집된 데이터 기반의 참고용 자료이며, 투자 판단의 근거로 사용하지 마세요. 투자 결정은 본인의 책임입니다.
        </p>
      </div>

      {/* B. 포트폴리오 진단 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">포트폴리오 진단</h3>

        {/* 전체 수익률 */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-500 dark:text-gray-400">총 수익률</span>
          <span className={`text-xl font-bold ${getPriceChangeColor(diagnosis.overallHealth.totalReturnPct)}`}>
            {formatPercent(diagnosis.overallHealth.totalReturnPct)}
          </span>
          {diagnosis.overallHealth.biggestContributor && (
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
              최대 기여: <span className="font-medium text-green-600 dark:text-green-400">{diagnosis.overallHealth.biggestContributor.name}</span> (+{diagnosis.overallHealth.biggestContributor.contribution.toFixed(2)}%p)
            </span>
          )}
        </div>

        {diagnosis.overallHealth.biggestDrag && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            최대 드래그: <span className="font-medium text-red-500">{diagnosis.overallHealth.biggestDrag.name}</span> ({diagnosis.overallHealth.biggestDrag.contribution.toFixed(2)}%p)
          </div>
        )}

        {/* 집중도 리스크 */}
        {diagnosis.concentrationRisk.hasRisk ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              집중 리스크 감지
            </p>
            {diagnosis.concentrationRisk.details.map((d, i) => (
              <div key={i} className="text-sm text-gray-700 dark:text-gray-300 bg-amber-50 dark:bg-amber-900/10 rounded px-3 py-2">
                {d.message}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            집중 리스크 없음 — 포트폴리오 분산이 양호합니다
          </div>
        )}
      </div>

      {/* C. 포트폴리오 조정 제안 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">포트폴리오 조정 제안</h3>

        {adjustmentSuggestions.length > 0 ? (
          <div className="space-y-3">
            {adjustmentSuggestions.map((s, i) => (
              <div
                key={`${s.ticker}-${s.action}`}
                className={`border-l-4 ${SEVERITY_BORDER[s.severity]} bg-gray-50 dark:bg-gray-700/50 rounded-r-lg px-4 py-3`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5">{i + 1}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${ACTION_STYLES[s.action] || ACTION_STYLES.hold}`}>
                    {s.actionLabel}
                  </span>
                  <Link
                    to={`/etf/${s.ticker}`}
                    className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {s.name}
                  </Link>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 ml-7">{s.rationale}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 py-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            현재 포트폴리오 구성이 양호합니다. 특별한 조정 필요 없음.
          </div>
        )}
      </div>

      {/* D. 관찰 종목 동향 */}
      {watchedStockAnalysis.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">관찰 종목 동향</h3>

          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">종목명</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-gray-400">일간</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-gray-400">주간</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-500 dark:text-gray-400">수급</th>
                  <th className="text-left py-2 pl-3 font-medium text-gray-500 dark:text-gray-400">평가</th>
                </tr>
              </thead>
              <tbody>
                {watchedStockAnalysis.map(w => (
                  <tr
                    key={w.ticker}
                    className={`border-b border-gray-100 dark:border-gray-700/50 ${
                      w.highlight ? 'bg-green-50/50 dark:bg-green-900/10' : ''
                    }`}
                  >
                    <td className="py-2 pr-3">
                      <Link
                        to={`/etf/${w.ticker}`}
                        className="font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {w.name}
                      </Link>
                      <span className="block text-xs text-gray-400 dark:text-gray-500">{w.theme}</span>
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${getPriceChangeColor(w.dailyChangePct)}`}>
                      {w.dailyChangePct != null ? formatPercent(w.dailyChangePct) : '-'}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${getPriceChangeColor(w.weeklyReturn)}`}>
                      {w.weeklyReturn != null ? formatPercent(w.weeklyReturn) : '-'}
                    </td>
                    <td className="py-2 px-2 text-center text-xs">
                      <span className={
                        w.tradingFlowDirection === 'both_buy' || w.tradingFlowDirection === 'foreign_buy'
                          ? 'text-green-600 dark:text-green-400 font-medium'
                          : w.tradingFlowDirection === 'selling'
                            ? 'text-red-500 dark:text-red-400 font-medium'
                            : 'text-gray-500 dark:text-gray-400'
                      }>
                        {w.tradingFlowSummary}
                      </span>
                    </td>
                    <td className="py-2 pl-3 text-sm text-gray-700 dark:text-gray-300">
                      {w.assessment}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* E. 보유 종목 건강 점검 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">보유 종목 건강 점검</h3>

        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 pr-3 font-medium text-gray-500 dark:text-gray-400">종목명</th>
                <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-gray-400">수익률</th>
                <th className="text-right py-2 px-2 font-medium text-gray-500 dark:text-gray-400">기여도</th>
                <th className="text-center py-2 px-2 font-medium text-gray-500 dark:text-gray-400">수급</th>
                <th className="text-center py-2 px-2 font-medium text-gray-500 dark:text-gray-400">상태</th>
                <th className="text-left py-2 pl-3 font-medium text-gray-500 dark:text-gray-400">비고</th>
              </tr>
            </thead>
            <tbody>
              {holdingsHealth.map(h => {
                const statusStyle = STATUS_BADGE[h.returnStatus]
                const flowStyle = FLOW_BADGE[h.tradingFlowSignal]
                return (
                  <tr key={h.ticker} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2 pr-3">
                      <Link
                        to={`/etf/${h.ticker}`}
                        className="font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {h.name}
                      </Link>
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${getPriceChangeColor(h.returnPct)}`}>
                      {formatPercent(h.returnPct)}
                    </td>
                    <td className={`py-2 px-2 text-right font-medium ${getPriceChangeColor(h.contribution)}`}>
                      {h.contribution >= 0 ? '+' : ''}{h.contribution.toFixed(2)}%p
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-xs font-medium ${flowStyle.className}`}>{flowStyle.label}</span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusStyle.className}`}>
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="py-2 pl-3 text-xs text-gray-500 dark:text-gray-400">{h.healthNote}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

PortfolioAnalysisReport.propTypes = {
  investedETFs: PropTypes.array.isRequired,
  trackingETFs: PropTypes.array,
  batchSummary: PropTypes.object.isRequired,
  allocation: PropTypes.array.isRequired,
  contributions: PropTypes.array.isRequired,
  summary: PropTypes.shape({
    totalInvestment: PropTypes.number.isRequired,
    totalValuation: PropTypes.number.isRequired,
    totalProfitLoss: PropTypes.number.isRequired,
    totalReturnPct: PropTypes.number.isRequired,
  }).isRequired,
}
