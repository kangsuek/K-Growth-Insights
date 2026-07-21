import PropTypes from 'prop-types'

// 전략 배지 색상 - 순수 함수로 컴포넌트 외부 정의
const STRATEGY_COLORS = {
  '비중확대': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  '보유': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  '관망': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  '비중축소': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const getStrategyColor = (strategyType) => {
  return STRATEGY_COLORS[strategyType] || STRATEGY_COLORS['관망']
}

/**
 * StrategySummary Component
 * 
 * 종목의 투자 전략과 핵심 포인트를 표시하는 컴포넌트
 * 
 * @param {string} ticker - 종목 티커
 * @param {string} period - 기간 ('1w', '1m', '3m', '6m', '1y')
 * @param {Object} insights - 인사이트 데이터 (props로 전달 시 API 호출 생략)
 * @param {boolean} isLoading - 로딩 상태
 * @param {Error} error - 에러 객체
 */
export default function StrategySummary({ ticker, period = '1m', insights, isLoading, error }) {

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">인사이트 분석 중...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              인사이트 로딩 실패
            </h3>
            <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
              {error.message || '인사이트를 불러오는 중 오류가 발생했습니다.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!insights) {
    return null
  }

  const { strategy, key_points } = insights

  return (
    <div className="space-y-6">
      {/* 투자 전략 섹션 - 컴팩트 */}
      <div className="card p-4">
        <h2 className="text-base font-semibold mb-3 text-gray-900 dark:text-gray-100">
          투자 전략
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">단기</span>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getStrategyColor(strategy.short_term)}`}>
            {strategy.short_term}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">중기</span>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getStrategyColor(strategy.medium_term)}`}>
            {strategy.medium_term}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">장기</span>
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getStrategyColor(strategy.long_term)}`}>
            {strategy.long_term}
          </span>
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">종합 </span>
          <span className={getStrategyColor(strategy.recommendation)}>{strategy.recommendation}</span>
          <span className="text-gray-600 dark:text-gray-400"> · {strategy.comment}</span>
        </div>
      </div>

      {/* 핵심 포인트 섹션 */}
      {key_points && key_points.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
            핵심 포인트
          </h2>
          <ul className="space-y-2">
            {key_points.map((point, index) => (
              <li key={index} className="flex items-start">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

StrategySummary.propTypes = {
  ticker: PropTypes.string.isRequired,
  period: PropTypes.string,
  insights: PropTypes.object,
  isLoading: PropTypes.bool,
  error: PropTypes.object,
}
