import PropTypes from 'prop-types'

/**
 * LoadingIndicator 컴포넌트
 *
 * 데이터 로딩 중임을 사용자에게 표시하는 인디케이터
 *
 * @param {boolean} isLoading - 로딩 여부
 * @param {string} message - 주요 메시지 (기본: "데이터를 불러오는 중...")
 * @param {string} subMessage - 보조 메시지 (선택)
 * @param {boolean} overlay - 오버레이 표시 여부 (기본: false)
 */
export default function LoadingIndicator({
  isLoading = false,
  message = "데이터를 불러오는 중...",
  subMessage = "",
  overlay = false
}) {
  if (!isLoading) return null;

  const content = (
    <div className="flex flex-col items-center justify-center p-8">
      {/* 스피너 */}
      <div className="relative w-16 h-16 mb-4">
        <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-200 rounded-full"></div>
        <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
      </div>

      {/* 메시지 */}
      <div className="text-center">
        <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">{message}</p>
        {subMessage && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{subMessage}</p>
        )}
      </div>
    </div>
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 bg-opacity-90 dark:bg-opacity-90 flex items-center justify-center z-50 transition-colors">
        {content}
      </div>
    );
  }

  return content;
}

LoadingIndicator.propTypes = {
  isLoading: PropTypes.bool,
  message: PropTypes.string,
  subMessage: PropTypes.string,
  overlay: PropTypes.bool,
}
