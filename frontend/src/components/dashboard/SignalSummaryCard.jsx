import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { getSignalBadges } from '../../utils/signalBadges'

/**
 * "오늘의 신호" 요약 카드 — 추적 종목 중 전일 대비 MACD 골든/데드크로스가 발생했거나
 * RSI 과매수·과매도 구간에 새로 진입한 종목만 모아 보여준다.
 *
 * 종목 발굴(스캐너) 카탈로그 딥수집 범위(전체 ETF + 코스피 상위 200 + 코스닥 상위 300)
 * 밖의 추적 종목도 놓치지 않도록, batch-summary가 로컬 시세만으로 계산한 값을 그대로 쓴다
 * (네이버 API 추가 호출 없음). 오늘 신호가 없으면 화면을 차지하지 않도록 렌더링하지 않는다.
 */
export default function SignalSummaryCard({ etfs, batchSummary }) {
  if (!etfs || !batchSummary) return null

  const flagged = etfs
    .map((etf) => ({ etf, summary: batchSummary[etf.ticker] }))
    .filter(({ summary }) => summary && (summary.macd_cross_signal || summary.rsi_zone_entered))

  if (flagged.length === 0) return null

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          오늘의 신호 {flagged.length}건
        </h2>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 transition-colors">
        {flagged.map(({ etf, summary }) => (
          <Link
            key={etf.ticker}
            to={`/etf/${etf.ticker}`}
            className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{etf.name}</span>
            <span className="flex items-center gap-1.5">
              {getSignalBadges(summary).map((badge) => (
                <span
                  key={badge.key}
                  className={`inline-block px-1.5 py-0.5 text-xs rounded font-medium ${badge.className}`}
                >
                  {badge.text}
                </span>
              ))}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

SignalSummaryCard.propTypes = {
  etfs: PropTypes.arrayOf(PropTypes.shape({
    ticker: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  })),
  batchSummary: PropTypes.object,
}
