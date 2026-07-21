export default function TickerDeleteConfirm({ ticker, onConfirm, onClose, isDeleting }) {
  if (!ticker) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[95vh] sm:max-h-auto overflow-y-auto transition-colors">
        {/* 헤더 */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">종목 삭제 확인</h3>
        </div>

        {/* 내용 */}
        <div className="px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
            {/* 경고 아이콘 */}
            <div className="flex-shrink-0 mx-auto sm:mx-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* 메시지 */}
            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm sm:text-base text-gray-900 dark:text-gray-100 font-medium mb-2">
                정말 <span className="font-bold text-red-600 dark:text-red-400">{ticker.ticker} ({ticker.name})</span> 종목을 삭제하시겠습니까?
              </p>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 sm:p-3 mt-3">
                <p className="text-xs sm:text-sm text-red-800 dark:text-red-300 font-medium mb-2">
                  ⚠️ 다음 데이터가 함께 삭제됩니다:
                </p>
                <ul className="text-xs sm:text-sm text-red-700 dark:text-red-400 space-y-1 list-disc list-inside text-left">
                  <li>stocks.json 파일에서 종목 정보 제거</li>
                  <li>데이터베이스의 모든 가격 데이터</li>
                  <li>데이터베이스의 모든 뉴스 데이터</li>
                  <li>데이터베이스의 모든 매매 동향 데이터</li>
                </ul>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-3">
                이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?
              </p>
            </div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 dark:bg-gray-700 rounded-b-lg flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="w-full sm:flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors text-sm sm:text-base"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="w-full sm:flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            {isDeleting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                삭제 중...
              </>
            ) : (
              '삭제'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
