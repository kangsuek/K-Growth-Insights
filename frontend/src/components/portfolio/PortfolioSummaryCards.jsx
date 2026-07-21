import PropTypes from 'prop-types'
import { formatPrice, formatPercent, getPriceChangeColor } from '../../utils/format'

/**
 * 포트폴리오 요약 카드
 */
export default function PortfolioSummaryCards({ summary, investedCount, trackingCount }) {
  const cards = [
    {
      label: '총 투자금액',
      value: formatPrice(summary.totalInvestment),
      color: 'text-gray-900 dark:text-gray-100',
      bgColor: 'bg-gray-50 dark:bg-gray-700/50',
    },
    {
      label: '총 평가금액',
      value: formatPrice(summary.totalValuation),
      color: 'text-gray-900 dark:text-gray-100',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: '총 손익',
      value: `${summary.totalProfitLoss >= 0 ? '+' : ''}${formatPrice(summary.totalProfitLoss)}`,
      color: getPriceChangeColor(summary.totalProfitLoss),
      bgColor: summary.totalProfitLoss >= 0
        ? 'bg-red-50 dark:bg-red-900/20'
        : 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: '총 수익률',
      value: formatPercent(summary.totalReturnPct),
      color: getPriceChangeColor(summary.totalReturnPct),
      bgColor: summary.totalReturnPct >= 0
        ? 'bg-red-50 dark:bg-red-900/20'
        : 'bg-blue-50 dark:bg-blue-900/20',
    },
  ]

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`${card.bgColor} rounded-lg p-4 shadow-sm transition-colors`}
          >
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{card.label}</p>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-sm text-gray-500 dark:text-gray-400">
        <span>투자 종목: <span className="font-semibold text-gray-700 dark:text-gray-300">{investedCount}개</span></span>
        <span>관찰 종목: <span className="font-semibold text-gray-700 dark:text-gray-300">{trackingCount}개</span></span>
      </div>
    </div>
  )
}

PortfolioSummaryCards.propTypes = {
  summary: PropTypes.shape({
    totalInvestment: PropTypes.number.isRequired,
    totalValuation: PropTypes.number.isRequired,
    totalProfitLoss: PropTypes.number.isRequired,
    totalReturnPct: PropTypes.number.isRequired,
  }).isRequired,
  investedCount: PropTypes.number.isRequired,
  trackingCount: PropTypes.number.isRequired,
}
