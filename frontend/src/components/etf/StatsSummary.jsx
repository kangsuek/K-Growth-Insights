import { useMemo } from 'react'
import PropTypes from 'prop-types'
import { format } from 'date-fns'
import { formatPrice, formatPercent } from '../../utils/format'
import { calculateStats, calculateAnnualizedReturn } from '../../utils/returns'
import InfoTooltip from '../common/InfoTooltip'

// 연환산 변동성 기준 리스크 등급 계산
const getRiskLevel = (volatility) => {
  if (volatility === null || volatility === undefined) return null
  if (volatility < 10) return { label: '안전', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
  if (volatility < 15) return { label: '낮음', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
  if (volatility < 25) return { label: '보통', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' }
  if (volatility < 35) return { label: '높음', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
  return { label: '매우높음', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
}

/**
 * StatCard 컴포넌트
 * 개별 통계 카드를 표시
 */
const StatCard = ({ title, children, icon, titleExtra }) => (
  <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center gap-2 mb-3">
      {icon && <span className="text-2xl">{icon}</span>}
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h4>
      {titleExtra}
    </div>
    <div className="space-y-2">{children}</div>
  </div>
)

StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  icon: PropTypes.string,
  titleExtra: PropTypes.node,
}

/**
 * StatItem 컴포넌트
 * 통계 항목 표시 (선택적 툴팁 지원)
 */
const StatItem = ({ label, value, color = 'text-gray-900 dark:text-gray-100', tooltip }) => (
  <div className="flex items-center justify-between">
    <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
      {label}
      {tooltip && <InfoTooltip content={tooltip} position="top" />}
    </span>
    <span className={`text-sm font-semibold ${color}`}>{value}</span>
  </div>
)

StatItem.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  color: PropTypes.string,
  tooltip: PropTypes.string,
}

/**
 * ProgressBar 컴포넌트
 * 진행률 바 표시
 */
const ProgressBar = ({ value, min, max, label, formatValue }) => {
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{formatValue(value)}</span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 dark:bg-blue-600 transition-all duration-300"
          style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
        ></div>
      </div>
    </div>
  )
}

ProgressBar.propTypes = {
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
  formatValue: PropTypes.func.isRequired,
}

/**
 * PriceRangeBar 컴포넌트
 * 가격 범위를 막대 형태로 표시 (최저가 ---|현재가----- 최고가)
 */
const PriceRangeBar = ({ currentPrice, minPrice, maxPrice, currentPriceDate, minPriceDate, maxPriceDate, formatPrice }) => {
  // 현재가가 범위를 벗어나는 경우 처리
  const clampedCurrentPrice = Math.max(minPrice, Math.min(maxPrice, currentPrice))
  const percentage = ((clampedCurrentPrice - minPrice) / (maxPrice - minPrice)) * 100

  // 현재가가 최저가 또는 최고가와 너무 가까운지 확인 (20% 이내)
  const isNearMin = percentage < 20
  const isNearMax = percentage > 80

  return (
    <div className="relative">
      {/* 막대 */}
      <div className="relative w-full h-3 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mb-2">
        {/* 전체 막대 배경 */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-200 via-gray-200 to-red-200 dark:from-blue-800 dark:via-gray-600 dark:to-red-800"></div>

        {/* 현재가 마커 */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-gray-900 dark:bg-gray-100 z-10"
          style={{ left: `${percentage}%`, transform: 'translateX(-50%)' }}
        >
          {/* 마커 상단 화살표 */}
          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[4px] border-transparent border-b-gray-900 dark:border-b-gray-100"></div>
        </div>
      </div>

      {/* 가격 레이블 (아래쪽) */}
      <div className="relative" style={{ minHeight: '3rem' }}>
        {/* 최저가/최고가가 겹치지 않는 경우: 기존 레이아웃 (양 끝 + 중앙) */}
        {!isNearMin && !isNearMax && (
          <div className="flex items-start justify-between">
            {/* 최저가 (왼쪽) */}
            <div className="flex flex-col items-start">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                최저가{minPriceDate && ` (${format(new Date(minPriceDate), 'MM-dd')})`}
              </span>
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                {formatPrice(minPrice)}
              </span>
            </div>

            {/* 현재가 (중간 위치) */}
            <div
              className="flex flex-col items-center absolute"
              style={{ left: '50%', transform: 'translateX(-50%)' }}
            >
              <span className="text-xs text-gray-500 dark:text-gray-400">
                현재가{currentPriceDate && ` (${format(new Date(currentPriceDate), 'MM-dd')})`}
              </span>
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                {formatPrice(currentPrice)}
              </span>
            </div>

            {/* 최고가 (오른쪽) */}
            <div className="flex flex-col items-end">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                최고가{maxPriceDate && ` (${format(new Date(maxPriceDate), 'MM-dd')})`}
              </span>
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                {formatPrice(maxPrice)}
              </span>
            </div>
          </div>
        )}

        {/* 최저가와 가까운 경우: 상단에 현재가(좌), 하단에 최저가/최고가 */}
        {isNearMin && (
          <div className="space-y-2">
            {/* 상단: 현재가 (왼쪽 배치) */}
            <div className="flex items-start justify-start">
              <div className="flex flex-col items-start">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  현재가{currentPriceDate && ` (${format(new Date(currentPriceDate), 'MM-dd')})`}
                </span>
                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrice(currentPrice)}
                </span>
              </div>
            </div>

            {/* 하단: 최저가 + 최고가 */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col items-start">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  최저가{minPriceDate && ` (${format(new Date(minPriceDate), 'MM-dd')})`}
                </span>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {formatPrice(minPrice)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  최고가{maxPriceDate && ` (${format(new Date(maxPriceDate), 'MM-dd')})`}
                </span>
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                  {formatPrice(maxPrice)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 최고가와 가까운 경우: 상단에 현재가(우), 하단에 최저가/최고가 */}
        {isNearMax && (
          <div className="space-y-2">
            {/* 상단: 현재가 (오른쪽 배치) */}
            <div className="flex items-start justify-end">
              <div className="flex flex-col items-end">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  현재가{currentPriceDate && ` (${format(new Date(currentPriceDate), 'MM-dd')})`}
                </span>
                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrice(currentPrice)}
                </span>
              </div>
            </div>

            {/* 하단: 최저가 + 최고가 */}
            <div className="flex items-start justify-between">
              <div className="flex flex-col items-start">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  최저가{minPriceDate && ` (${format(new Date(minPriceDate), 'MM-dd')})`}
                </span>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  {formatPrice(minPrice)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  최고가{maxPriceDate && ` (${format(new Date(maxPriceDate), 'MM-dd')})`}
                </span>
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                  {formatPrice(maxPrice)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

PriceRangeBar.propTypes = {
  currentPrice: PropTypes.number.isRequired,
  minPrice: PropTypes.number.isRequired,
  maxPrice: PropTypes.number.isRequired,
  currentPriceDate: PropTypes.string,
  minPriceDate: PropTypes.string,
  maxPriceDate: PropTypes.string,
  formatPrice: PropTypes.func.isRequired,
}

// 수익률 색상 - 순수 함수로 컴포넌트 외부 정의
const getReturnColor = (value) => {
  if (value > 0) return 'text-red-600 dark:text-red-400'
  if (value < 0) return 'text-blue-600 dark:text-blue-400'
  return 'text-gray-500 dark:text-gray-400'
}

/**
 * StatsSummary 컴포넌트
 * 가격 데이터의 통계 요약을 카드 형태로 표시
 *
 * 기능:
 * - 기간 수익률 / 연환산 수익률
 * - 변동성 (표준편차) / Max Drawdown
 * - 가격 범위 (최고가, 최저가, 평균가)
 * - 거래량 통계 (평균, 최대)
 * - 카드 레이아웃 (2x2 그리드)
 * - 시각적 표시 (아이콘, 진행률 바)
 *
 * @param {Array} data - 가격 데이터 배열
 * @param {number} purchasePrice - 매입 가격 (선택사항)
 * @param {string} purchaseDate - 매입 날짜 (선택사항)
 */
export default function StatsSummary({ data = [], purchasePrice = null, purchaseDate = null }) {
  const stats = useMemo(() => calculateStats(data, purchasePrice, purchaseDate), [data, purchasePrice, purchaseDate])

  // 데이터가 없거나 통계 계산 실패
  if (!stats) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>통계를 계산할 데이터가 부족합니다</p>
        <p className="text-sm mt-1">최소 2개 이상의 데이터가 필요합니다</p>
      </div>
    )
  }

  // 연환산 수익률 계산 (3개월 미만은 표기 안 함)
  const annualizedReturn = useMemo(() => {
    return calculateAnnualizedReturn(data)
  }, [data])

  // 리스크 등급 계산
  const riskLevel = useMemo(() => {
    return getRiskLevel(stats?.annualizedVolatility)
  }, [stats?.annualizedVolatility])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* 수익률 카드 */}
      <StatCard title="수익률" icon="📈">
        <StatItem
          label="기간 수익률"
          value={formatPercent(stats.periodReturn)}
          color={getReturnColor(stats.periodReturn)}
          tooltip="선택한 기간의 첫날 종가 대비 현재 종가의 수익률입니다. 양수(+)는 수익, 음수(-)는 손실을 의미합니다."
        />
        {annualizedReturn.showAnnualized ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {annualizedReturn.label}
              </span>
              {annualizedReturn.note && (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                  ({annualizedReturn.note})
                </span>
              )}
            </div>
            <span className={`text-sm font-semibold ${getReturnColor(annualizedReturn.value)}`}>
              {formatPercent(annualizedReturn.value)}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {annualizedReturn.label}
            </span>
            <span className={`text-sm font-semibold ${getReturnColor(annualizedReturn.value)}`}>
              {formatPercent(annualizedReturn.value)}
            </span>
          </div>
        )}
        {stats.purchaseReturn !== null ? (
          <StatItem
            label="매입 대비 수익률"
            value={formatPercent(stats.purchaseReturn)}
            color={getReturnColor(stats.purchaseReturn)}
          />
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">매입 대비 수익률</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">
              (매입가 미설정)
            </span>
          </div>
        )}
        <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-600">
          <div className="flex items-center gap-2">
            <div
              className={`flex-1 h-2 rounded-full ${
                stats.periodReturn >= 0
                  ? 'bg-gradient-to-r from-gray-200 to-red-500 dark:from-gray-600 dark:to-red-600'
                  : 'bg-gradient-to-r from-blue-500 to-gray-200 dark:from-blue-600 dark:to-gray-600'
              }`}
            ></div>
          </div>
        </div>
      </StatCard>

      {/* 가격 범위 카드 */}
      <StatCard title="가격 범위" icon="💰">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">최고가</span>
          <span className="text-sm font-semibold text-red-600 dark:text-red-400">
            {formatPrice(stats.highPrice)}
            {stats.highPriceDate && (
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                ({format(new Date(stats.highPriceDate), 'MM-dd')})
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">최저가</span>
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {formatPrice(stats.lowPrice)}
            {stats.lowPriceDate && (
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                ({format(new Date(stats.lowPriceDate), 'MM-dd')})
              </span>
            )}
          </span>
        </div>
        <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-600">
          <PriceRangeBar
            currentPrice={stats.currentPrice}
            minPrice={stats.lowPrice}
            maxPrice={stats.highPrice}
            currentPriceDate={stats.currentPriceDate}
            minPriceDate={stats.lowPriceDate}
            maxPriceDate={stats.highPriceDate}
            formatPrice={formatPrice}
          />
        </div>
      </StatCard>

      {/* 리스크 지표 카드 */}
      <StatCard
        title="리스크 지표"
        icon="⚠️"
        titleExtra={riskLevel && (
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${riskLevel.color}`}>
            {riskLevel.label}
          </span>
        )}
      >
        {stats.annualizedVolatility !== null ? (
          <StatItem
            label="연환산 변동성"
            value={formatPercent(stats.annualizedVolatility)}
            color={stats.annualizedVolatility > 30 ? 'text-red-600 dark:text-red-400' : stats.annualizedVolatility < 15 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}
            tooltip="일별 수익률의 표준편차를 연 단위로 환산한 값입니다. 값이 클수록 가격 변동이 심합니다. 15% 미만은 안정적, 30% 이상은 고위험입니다."
          />
        ) : (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              연환산 변동성
              <InfoTooltip content="일별 수익률의 표준편차를 연 단위로 환산한 값입니다. 값이 클수록 가격 변동이 심합니다." position="top" />
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">
              (데이터 부족)
            </span>
          </div>
        )}
        {stats.maxDrawdown !== null ? (
          <StatItem
            label="최대 낙폭 (MDD)"
            value={formatPercent(-stats.maxDrawdown.value)}
            color="text-red-600 dark:text-red-400"
            tooltip="특정 기간 내 최고점에서 최저점까지 하락한 최대 폭입니다. 예를 들어 MDD -25%는 최악의 경우 투자금의 25%를 잃을 수 있었다는 의미입니다."
          />
        ) : (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              최대 낙폭 (MDD)
              <InfoTooltip content="최고점에서 최저점까지 하락한 최대 폭입니다. 투자 리스크를 가늠하는 핵심 지표입니다." position="top" />
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">
              (데이터 부족)
            </span>
          </div>
        )}
        {stats.dailyVolatility !== null && (
          <StatItem
            label="일간 변동성"
            value={formatPercent(stats.dailyVolatility)}
            color="text-gray-700 dark:text-gray-300"
            tooltip="하루 동안 가격이 평균적으로 얼마나 움직이는지를 나타냅니다. 일간 변동성이 2%면 하루에 ±2% 내외로 가격이 움직인다고 이해하면 됩니다."
          />
        )}
      </StatCard>
    </div>
  )
}

StatsSummary.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      close_price: PropTypes.number.isRequired,
      volume: PropTypes.number.isRequired,
    })
  ),
  purchasePrice: PropTypes.number,
  purchaseDate: PropTypes.string,
}
