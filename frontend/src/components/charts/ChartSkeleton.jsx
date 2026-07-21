/**
 * ChartSkeleton 컴포넌트
 * 차트 로딩 중 표시할 스켈레톤 UI
 *
 * @param {number} height - 스켈레톤 높이 (기본값: 400)
 */
export default function ChartSkeleton({ height = 400 }) {
  return (
    <div
      className="animate-pulse bg-gray-100 rounded-lg"
      style={{ height: `${height}px` }}
      role="status"
      aria-label="차트 로딩 중"
    >
      <div className="h-full flex flex-col justify-end p-4 gap-2">
        {/* 가상의 막대 그래프 */}
        <div className="flex items-end justify-between gap-1 h-full">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="bg-gray-300 rounded-t w-full"
              style={{
                height: `${Math.random() * 60 + 40}%`,
              }}
            />
          ))}
        </div>
        {/* X축 */}
        <div className="h-4 bg-gray-300 rounded w-full" />
      </div>
    </div>
  )
}
