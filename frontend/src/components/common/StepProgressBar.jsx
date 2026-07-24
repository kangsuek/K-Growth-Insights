/**
 * 단계별 진행률 바 — 단계 칩 + 진행바 + 메시지/누적 건수.
 *
 * 기본값은 종목 목록 수집(코스피→코스닥→ETF→저장) 기준이며,
 * stepLabels·percent·itemsLabel을 넘기면 다른 수집 작업에도 그대로 재사용한다.
 *
 * @param percent 지정하면 단계 비율 대신 이 값(0~100)으로 바를 채운다.
 */
export default function StepProgressBar({
  stepIndex,
  totalSteps,
  message,
  itemsCollected,
  stepLabels = ['코스피', '코스닥', 'ETF', '저장'],
  itemsLabel = '수집',
  percent,
}) {
  const stepRatio = totalSteps > 0 ? Math.round((stepIndex / totalSteps) * 100) : 0
  const width = percent != null ? percent : stepRatio

  return (
    <div className="mt-3 space-y-2">
      {/* 단계 표시 */}
      <div className="flex items-center gap-1">
        {stepLabels.map((label, idx) => (
          <div key={label} className="flex items-center">
            <div
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                idx < stepIndex
                  ? 'bg-blue-500 text-white'
                  : idx === stepIndex
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 ring-1 ring-blue-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
              }`}
            >
              {label}
            </div>
            {idx < stepLabels.length - 1 && (
              <div className={`w-3 h-0.5 mx-0.5 ${idx < stepIndex ? 'bg-blue-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
            )}
          </div>
        ))}
      </div>
      {/* 프로그레스 바 */}
      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
        <div
          className="h-3 rounded-full transition-all duration-500 bg-blue-500"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-600 dark:text-gray-300 truncate mr-2">
          {message}
        </span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
          {itemsCollected > 0 ? `${itemsCollected.toLocaleString('ko-KR')}개 ${itemsLabel}` : ''}
        </span>
      </div>
    </div>
  )
}
