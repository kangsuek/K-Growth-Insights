import { useMemo, Fragment } from 'react'
import PropTypes from 'prop-types'
import { useSettings } from '../../contexts/SettingsContext'

/**
 * 상관계수 값에 따른 배경색 계산
 * 파랑(0, 낮은 상관) → 흰색(0.5, 중간) → 빨강(1, 높은 상관)
 *
 * @param {number} value - 상관계수 (0 ~ 1)
 * @param {boolean} isDark - 다크모드 여부
 * @returns {string} rgba 색상 문자열
 */
function getCorrelationColor(value, isDark) {
  const clampedValue = Math.max(0, Math.min(1, value))

  if (isDark) {
    // 다크모드: 파랑(0) → 회색(0.5) → 빨강(1)
    if (clampedValue <= 0.5) {
      const t = clampedValue / 0.5
      const r = Math.round(30 + t * 30)
      const g = Math.round(58 + t * 10)
      const b = Math.round(138 - t * 70)
      return `rgba(${r}, ${g}, ${b}, 0.6)`
    } else {
      const t = (clampedValue - 0.5) / 0.5
      const r = Math.round(60 + t * 125)
      const g = Math.round(68 - t * 40)
      const b = Math.round(68 - t * 40)
      return `rgba(${r}, ${g}, ${b}, 0.6)`
    }
  } else {
    // 라이트모드: 파랑(0) → 흰색(0.5) → 빨강(1)
    if (clampedValue <= 0.5) {
      const t = clampedValue / 0.5
      const r = Math.round(219 + t * 36)
      const g = Math.round(234 + t * 21)
      const b = Math.round(254 - t * 14)
      return `rgba(${r}, ${g}, ${b}, 1)`
    } else {
      const t = (clampedValue - 0.5) / 0.5
      const r = Math.round(255 - t * 1)
      const g = Math.round(255 - t * 29)
      const b = Math.round(240 - t * 14)
      return `rgba(${r}, ${g}, ${b}, 1)`
    }
  }
}

/**
 * 상관계수에 따른 텍스트 색상
 *
 * @param {number} value - 상관계수
 * @param {boolean} isDark - 다크모드 여부
 * @returns {string} 텍스트 색상
 */
function getTextColor(value, isDark) {
  if (isDark) {
    return value > 0.8 ? '#fecaca' : value < 0.2 ? '#bfdbfe' : '#e5e7eb'
  }
  return value > 0.8 ? '#991b1b' : value < 0.2 ? '#1e40af' : '#374151'
}

/**
 * CorrelationHeatmap Component
 *
 * CSS Grid 기반 상관관계 히트맵
 * - API 응답의 correlation_matrix.tickers와 correlation_matrix.matrix 사용
 * - N×N 그리드 테이블
 * - 셀 배경색: 상관계수에 따라 그라데이션 (파랑 0 → 빨강 1)
 *
 * @param {Object} correlationMatrix - { tickers: [...], matrix: [[...], ...] }
 * @param {Object} tickerInfo - { ticker: { name, ... } }
 */
export default function CorrelationHeatmap({ correlationMatrix = null, tickerInfo = {} }) {
  const { settings } = useSettings()

  // 다크모드 감지 (테마 변경 시 반응)
  const isDark = useMemo(() => {
    if (typeof document === 'undefined') return false
    return document.documentElement.classList.contains('dark')
  }, [settings.theme])

  // 종목명 매핑
  const tickerNames = useMemo(() => {
    if (!correlationMatrix?.tickers) return []
    return correlationMatrix.tickers.map(
      (ticker) => tickerInfo[ticker]?.name || ticker
    )
  }, [correlationMatrix, tickerInfo])

  if (
    !correlationMatrix ||
    !correlationMatrix.tickers ||
    !correlationMatrix.matrix ||
    correlationMatrix.tickers.length === 0
  ) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          상관관계 히트맵
        </h3>
        <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
          데이터가 없습니다
        </div>
      </div>
    )
  }

  const { tickers, matrix } = correlationMatrix
  const size = tickers.length

  return (
    <div className="card">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          상관관계 히트맵
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          종목 간 가격 움직임의 상관관계
        </p>
      </div>

      {/* 히트맵 테이블 */}
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-0.5 min-w-fit"
          style={{
            gridTemplateColumns: `auto repeat(${size}, minmax(70px, 1fr))`,
          }}
        >
          {/* 헤더 행: 빈 셀 + 열 헤더 */}
          <div className="p-2" /> {/* 빈 코너 셀 */}
          {tickerNames.map((name, colIdx) => (
            <div
              key={`header-${colIdx}`}
              className="p-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 truncate"
              title={name}
            >
              {name}
            </div>
          ))}

          {/* 데이터 행 */}
          {matrix.map((row, rowIdx) => (
            <Fragment key={`row-${rowIdx}`}>
              {/* 행 헤더 */}
              <div
                className="p-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 truncate flex items-center justify-end"
                title={tickerNames[rowIdx]}
              >
                {tickerNames[rowIdx]}
              </div>

              {/* 데이터 셀 */}
              {row.map((value, colIdx) => {
                const isDiagonal = rowIdx === colIdx
                const displayValue = value !== null && value !== undefined
                  ? value.toFixed(2)
                  : 'N/A'

                return (
                  <div
                    key={`cell-${rowIdx}-${colIdx}`}
                    className={`p-2 text-center text-xs font-medium rounded-sm transition-transform hover:scale-105 cursor-default ${
                      isDiagonal ? 'ring-1 ring-gray-300 dark:ring-gray-600' : ''
                    }`}
                    style={{
                      backgroundColor: getCorrelationColor(value ?? 0, isDark),
                      color: getTextColor(value ?? 0, isDark),
                    }}
                    title={`${tickerNames[rowIdx]} × ${tickerNames[colIdx]}: ${displayValue}`}
                  >
                    {displayValue}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* 컬러 범례 */}
      <div className="mt-4 flex items-center justify-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">0 (독립적)</span>
        <div className="flex h-3 w-40 rounded overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="flex-1"
              style={{ backgroundColor: getCorrelationColor(i / 19, isDark) }}
            />
          ))}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">1 (동일)</span>
      </div>

      {/* 설명 */}
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
        1에 가까울수록 함께 움직이는 종목, 0에 가까울수록 독립적 → 분산 투자에 유리
      </p>
    </div>
  )
}

CorrelationHeatmap.propTypes = {
  correlationMatrix: PropTypes.shape({
    tickers: PropTypes.arrayOf(PropTypes.string).isRequired,
    matrix: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
  }),
  tickerInfo: PropTypes.object.isRequired,
}
