import PropTypes from 'prop-types'

/**
 * DashboardFilters 컴포넌트
 * 대시보드의 정렬 필터 컨트롤
 *
 * @param {Object} props
 * @param {string} props.sortBy - 현재 정렬 기준 ('config', 'type', 'name', 'theme', 'custom')
 * @param {string} props.sortDirection - 정렬 방향 ('asc', 'desc')
 * @param {Function} props.onSortChange - 정렬 변경 핸들러
 */
export default function DashboardFilters({ sortBy, sortDirection, onSortChange }) {
  return (
    <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm transition-colors">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">정렬:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 설정 순서 정렬 (기본) */}
            <button
              onClick={() => onSortChange('config')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                sortBy === 'config'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              aria-label="설정 순서"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              설정 순서
            </button>

            {/* 타입 정렬 */}
            <button
              onClick={() => onSortChange('type')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                sortBy === 'type'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              aria-label="타입순 정렬"
            >
              타입
              {sortBy === 'type' && (
                <span className="ml-0.5">{sortDirection === 'asc' ? '▲' : '▼'}</span>
              )}
            </button>

            {/* 이름 정렬 */}
            <button
              onClick={() => onSortChange('name')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                sortBy === 'name'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              aria-label="이름순 정렬"
            >
              이름
              {sortBy === 'name' && (
                <span className="ml-0.5">{sortDirection === 'asc' ? '▲' : '▼'}</span>
              )}
            </button>

            {/* 테마 정렬 */}
            <button
              onClick={() => onSortChange('theme')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                sortBy === 'theme'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              aria-label="테마순 정렬"
            >
              테마
              {sortBy === 'theme' && (
                <span className="ml-0.5">{sortDirection === 'asc' ? '▲' : '▼'}</span>
              )}
            </button>

            {/* 커스텀 정렬 */}
            <button
              onClick={() => onSortChange('custom')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                sortBy === 'custom'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              aria-label="사용자 지정 순서"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              사용자 지정
            </button>
          </div>
        </div>

        {/* 설정 순서 모드 안내 */}
        {sortBy === 'config' && (
          <div className="flex items-start gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
            <svg className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-green-700 dark:text-green-300">
              <span className="font-medium">종목 관리에서 설정한 순서대로 표시됩니다.</span>
              <span className="block mt-1 text-xs text-green-600 dark:text-green-400">설정 페이지에서 종목 순서를 변경할 수 있습니다.</span>
            </div>
          </div>
        )}

        {/* 커스텀 정렬 모드 안내 */}
        {sortBy === 'custom' && (
          <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
            <svg className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <span className="font-medium">드래그 앤 드롭으로 카드 순서를 변경할 수 있습니다.</span>
              <span className="block mt-1 text-xs text-blue-600 dark:text-blue-400">카드를 클릭한 채로 원하는 위치로 이동해보세요. 변경된 순서는 자동으로 저장됩니다.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

DashboardFilters.propTypes = {
  sortBy: PropTypes.oneOf(['config', 'type', 'name', 'theme', 'custom']).isRequired,
  sortDirection: PropTypes.oneOf(['asc', 'desc']).isRequired,
  onSortChange: PropTypes.func.isRequired,
}

