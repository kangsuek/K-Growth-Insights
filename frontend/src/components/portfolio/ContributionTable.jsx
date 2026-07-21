import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { formatPrice, formatPercent, getPriceChangeColor } from '../../utils/format'

/**
 * 종목별 기여도 테이블
 */
export default function ContributionTable({ contributions, trackingETFs }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 transition-colors">
      <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">종목별 기여도</h3>

      {contributions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">종목명</th>
                <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">투자금액</th>
                <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">평가금액</th>
                <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">손익</th>
                <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">수익률</th>
                <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">기여도</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((item) => (
                <tr key={item.ticker} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="py-2.5 px-2">
                    <Link
                      to={`/etf/${item.ticker}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="text-right py-2.5 px-2 text-gray-700 dark:text-gray-300">{formatPrice(item.investment)}</td>
                  <td className="text-right py-2.5 px-2 text-gray-700 dark:text-gray-300">{formatPrice(item.valuation)}</td>
                  <td className={`text-right py-2.5 px-2 font-medium ${getPriceChangeColor(item.profitLoss)}`}>
                    {item.profitLoss >= 0 ? '+' : ''}{formatPrice(item.profitLoss)}
                  </td>
                  <td className={`text-right py-2.5 px-2 font-medium ${getPriceChangeColor(item.returnPct)}`}>
                    {formatPercent(item.returnPct)}
                  </td>
                  <td className={`text-right py-2.5 px-2 font-semibold ${getPriceChangeColor(item.contribution)}`}>
                    {item.contribution >= 0 ? '+' : ''}{item.contribution.toFixed(2)}%p
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-4">투자 종목이 없습니다</p>
      )}

      {/* 관찰 중 종목 */}
      {trackingETFs && trackingETFs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">관찰 중인 종목</h4>
          <div className="flex flex-wrap gap-2">
            {trackingETFs.map((etf) => (
              <Link
                key={etf.ticker}
                to={`/etf/${etf.ticker}`}
                className="inline-flex items-center px-3 py-1.5 rounded-full text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {etf.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

ContributionTable.propTypes = {
  contributions: PropTypes.arrayOf(
    PropTypes.shape({
      ticker: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      investment: PropTypes.number.isRequired,
      valuation: PropTypes.number.isRequired,
      profitLoss: PropTypes.number.isRequired,
      returnPct: PropTypes.number.isRequired,
      contribution: PropTypes.number.isRequired,
    })
  ).isRequired,
  trackingETFs: PropTypes.array,
}
