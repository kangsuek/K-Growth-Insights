import PropTypes from 'prop-types'

/**
 * ErrorFallback 컴포넌트
 * 차트나 데이터 로딩 에러 시 표시되는 폴백 UI
 * 
 * @param {Object} error - 에러 객체
 * @param {Function} onRetry - 재시도 콜백 함수 (선택)
 */
const ErrorFallback = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-lg p-8 min-h-[300px] transition-colors">
    <p className="text-red-600 dark:text-red-400 font-semibold mb-2">데이터를 불러오는데 실패했습니다</p>
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{error?.message || '알 수 없는 오류가 발생했습니다'}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-800 transition-colors"
      >
        다시 시도
      </button>
    )}
  </div>
)

ErrorFallback.propTypes = {
  error: PropTypes.object,
  onRetry: PropTypes.func,
}

export default ErrorFallback

