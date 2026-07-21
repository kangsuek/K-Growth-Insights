import { useMemo } from 'react'
import PropTypes from 'prop-types'
import { generateAllInsights } from '../../utils/insights'

/**
 * InsightSummary 컴포넌트
 * 투자 인사이트 요약을 페이지 상단에 표시
 *
 * 기능:
 * - 핵심 포인트 (최대 4개): 매매동향, 추세, 변동성 분석
 * - 리스크 요약 (최대 3개): 위험 요소 알림
 */
// 인사이트 타입별 스타일 - 순수 함수로 컴포넌트 외부 정의
const getInsightStyle = (type) => {
  switch (type) {
    case 'positive':
      return {
        icon: '📈',
        dotColor: 'bg-green-500',
        textColor: 'text-green-700 dark:text-green-400'
      }
    case 'warning':
      return {
        icon: '📉',
        dotColor: 'bg-orange-500',
        textColor: 'text-orange-700 dark:text-orange-400'
      }
    case 'neutral':
      return {
        icon: '➖',
        dotColor: 'bg-gray-400',
        textColor: 'text-gray-600 dark:text-gray-400'
      }
    default:
      return {
        icon: '•',
        dotColor: 'bg-blue-500',
        textColor: 'text-gray-700 dark:text-gray-300'
      }
  }
}

export default function InsightSummary({ pricesData = [], tradingFlowData = [] }) {
  const { insights, risks } = useMemo(
    () => generateAllInsights(pricesData, tradingFlowData),
    [pricesData, tradingFlowData]
  )

  // 데이터가 없거나 인사이트가 없으면 렌더링하지 않음
  if ((!insights || insights.length === 0) && (!risks || risks.length === 0)) {
    return null
  }

  return (
    <div className="card mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-750 border border-blue-100 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">📊</span>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          투자 인사이트 요약
        </h3>
      </div>

      {/* 핵심 포인트 */}
      {insights && insights.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">💡</span>
            <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">
              핵심 포인트
            </h4>
          </div>
          <ul className="space-y-2 ml-1">
            {insights.map((insight, index) => {
              const style = getInsightStyle(insight.type)
              return (
                <li key={index} className="flex items-start gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full mt-1.5 ${style.dotColor}`}
                  />
                  <span className={`text-sm ${style.textColor}`}>
                    {insight.text}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* 리스크 요약 */}
      {risks && risks.length > 0 && (
        <div className="pt-3 border-t border-blue-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">⚠️</span>
            <h4 className="text-sm font-medium text-orange-600 dark:text-orange-400">
              리스크 요약
            </h4>
          </div>
          <ul className="space-y-1.5 ml-1">
            {risks.map((risk, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-orange-600 dark:text-orange-400"
              >
                <span className="inline-block w-2 h-2 rounded-full mt-1.5 bg-orange-500" />
                <span>{risk.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 데이터 부족 시 안내 */}
      {insights.length === 0 && risks.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          충분한 데이터가 수집되면 인사이트가 표시됩니다.
        </p>
      )}
    </div>
  )
}

InsightSummary.propTypes = {
  pricesData: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      close_price: PropTypes.number.isRequired,
      daily_change_pct: PropTypes.number
    })
  ),
  tradingFlowData: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      foreign_net: PropTypes.number,
      institutional_net: PropTypes.number,
      individual_net: PropTypes.number
    })
  )
}

