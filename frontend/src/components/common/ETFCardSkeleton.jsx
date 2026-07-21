export default function ETFCardSkeleton() {
  return (
    <div className="card animate-pulse" data-testid="etf-card-skeleton">
      {/* 헤더 */}
      <div className="mb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
          </div>
          <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded-full ml-2"></div>
        </div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      </div>

      {/* 가격 정보 */}
      <div className="mb-4 py-3 border-t border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-baseline justify-between mb-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
        <div className="flex justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
        </div>
      </div>

      {/* 매매 동향 */}
      <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
        <div className="grid grid-cols-3 gap-1">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>

      {/* 뉴스 */}
      <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex justify-between mb-1">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-8"></div>
        </div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
      </div>

      {/* 하단 */}
      <div className="flex justify-between">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
      </div>
    </div>
  )
}
