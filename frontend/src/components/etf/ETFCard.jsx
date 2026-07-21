import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState, memo, useMemo } from 'react'
import PropTypes from 'prop-types'
import { etfApi, newsApi } from '../../services/api'
import { COLORS } from '../../constants'
import { formatPrice, formatVolume, formatPercent, getPriceChangeColor } from '../../utils/format'

// 매매 동향 포맷팅 (억 단위, 천 단위 콤마) - 순수 함수로 컴포넌트 외부 정의
const formatTradingValue = (value) => {
  if (!value) return '0'
  const absValue = Math.abs(value)
  if (absValue >= 100000000) {
    const billions = (value / 100000000).toFixed(0)
    return `${new Intl.NumberFormat('ko-KR').format(billions)}억`
  } else if (absValue >= 10000) {
    const tenThousands = (value / 10000).toFixed(0)
    return `${new Intl.NumberFormat('ko-KR').format(tenThousands)}만`
  }
  return new Intl.NumberFormat('ko-KR').format(value)
}

// 날짜 포맷팅 (MM/DD) - 순수 함수로 컴포넌트 외부 정의
const formatChartDate = (dateStr) => {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const ETFCard = memo(function ETFCard({ etf, summary }) {
  const [hoveredPoint, setHoveredPoint] = useState(null)

  // summary가 있으면 배치 API 데이터 사용, 없으면 개별 API 호출 (폴백)
  const { data: prices, isLoading: pricesLoading } = useQuery({
    queryKey: ['prices', etf.ticker],
    queryFn: async () => {
      const response = await etfApi.getPrices(etf.ticker, { days: 5 })
      return response.data
    },
    retry: 1,
    staleTime: 60000, // 1분간 캐시
    enabled: !summary,  // summary가 없을 때만 개별 조회
  })

  const { data: tradingFlow } = useQuery({
    queryKey: ['trading-flow', etf.ticker],
    queryFn: async () => {
      const response = await etfApi.getTradingFlow(etf.ticker, { days: 1 })
      return response.data
    },
    retry: 1,
    staleTime: 60000,
    enabled: !summary,  // summary가 없을 때만 개별 조회
  })

  const { data: news } = useQuery({
    queryKey: ['news', etf.ticker],
    queryFn: async () => {
      const response = await newsApi.getByTicker(etf.ticker, { limit: 5 })
      return response.data
    },
    retry: 1,
    staleTime: 300000, // 5분간 캐시
    enabled: !summary,  // summary가 없을 때만 개별 조회
  })

  // 배치 데이터 또는 개별 데이터 사용
  const actualPrices = summary?.prices || prices
  const latestPrice = summary?.latest_price || prices?.[0]
  // API는 날짜 내림차순으로 반환: prices[0] = 최신, prices[length-1] = 가장 오래된 날짜
  const weeklyReturn = summary?.weekly_return !== undefined
    ? summary.weekly_return
    : (prices && prices.length >= 2
        ? ((prices[0].close_price - prices[prices.length - 1].close_price) / prices[prices.length - 1].close_price) * 100
        : null)

  // 매입가 대비 수익률 계산
  const purchaseReturn = etf.purchase_price && latestPrice?.close_price
    ? ((latestPrice.close_price - etf.purchase_price) / etf.purchase_price) * 100
    : null

  const latestTradingFlow = summary?.latest_trading_flow || tradingFlow?.[0]
  const actualNews = summary?.latest_news || news

  const isLoading = !summary && pricesLoading

  // 미니 캔들스틱 차트 기하 계산 (가격 데이터가 바뀔 때만 재계산; hover 상태 변화에는 불변)
  const chartGeometry = useMemo(() => {
    if (!actualPrices || actualPrices.length < 2) return null

    const reversedPrices = [...actualPrices].reverse() // 오래된 것부터

    // 전체 가격 범위 계산 (고가/저가 기준)
    const allPrices = reversedPrices.flatMap(p => [p.high_price, p.low_price])
    const min = Math.min(...allPrices)
    const max = Math.max(...allPrices)
    const range = max - min || 1

    const height = 50
    const width = 100
    const candleWidth = width / (reversedPrices.length * 5) // 캔들 너비 (폭 축소)

    // 가격을 Y 좌표로 변환
    const priceToY = (price) => height - ((price - min) / range) * height

    // 캔들스틱 데이터 계산
    const candles = reversedPrices.map((p, i) => {
      const x = (i + 0.5) * (width / reversedPrices.length)
      const isUp = p.close_price >= p.open_price

      return {
        x,
        high: priceToY(p.high_price),
        low: priceToY(p.low_price),
        open: priceToY(p.open_price),
        close: priceToY(p.close_price),
        isUp,
        data: p,
      }
    })

    return { candles, candleWidth, width, height, count: reversedPrices.length }
  }, [actualPrices])

  // 미니 캔들스틱 차트 생성 (OHLC)
  const renderMiniChart = () => {
    if (!chartGeometry) return null

    const { candles, candleWidth, width, height, count } = chartGeometry

    return (
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: `${height}px` }}
          onMouseLeave={() => setHoveredPoint(null)}
          role="img"
          aria-label={`최근 ${count}일간 가격 차트`}
        >
          {/* 배경 일자 구분선 */}
          {candles.map((candle, i) => (
            <line
              key={`grid-${i}`}
              x1={candle.x}
              y1={0}
              x2={candle.x}
              y2={height}
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-700"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
          ))}

          {/* 캔들스틱 */}
          {candles.map((candle, i) => {
            const bodyTop = Math.min(candle.open, candle.close)
            const bodyBottom = Math.max(candle.open, candle.close)
            const bodyHeight = Math.abs(candle.close - candle.open) || 0.5
            const color = candle.isUp ? COLORS.PRICE_UP : COLORS.CHART_PRIMARY

            return (
              <g key={`candle-${i}`}>
                {/* 고가-저가 심지 (Wick) */}
                <line
                  x1={candle.x}
                  y1={candle.high}
                  x2={candle.x}
                  y2={candle.low}
                  stroke={color}
                  strokeWidth="0.5"
                />

                {/* 시가-종가 몸통 (Body) */}
                <rect
                  x={candle.x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={color}
                  stroke={color}
                  strokeWidth="1"
                  opacity={hoveredPoint === i ? 1 : 0.9}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredPoint(i)}
                />

                {/* 투명한 인터랙션 영역 */}
                <rect
                  x={i === 0 ? 0 : candle.x - (width / count) / 2}
                  y={0}
                  width={width / count}
                  height={height}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredPoint(i)}
                />
              </g>
            )
          })}
        </svg>

        {/* 툴팁 */}
        {hoveredPoint !== null && candles[hoveredPoint] && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 dark:bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10 pointer-events-none border border-gray-700 dark:border-gray-600">
            <div className="font-semibold mb-1">{formatChartDate(candles[hoveredPoint].data.date)}</div>
            <div className="grid grid-cols-2 gap-x-2 text-xs">
              <div className="text-gray-300">시가:</div>
              <div>{formatPrice(candles[hoveredPoint].data.open_price)}</div>
              <div className="text-gray-300">고가:</div>
              <div className="text-red-400">{formatPrice(candles[hoveredPoint].data.high_price)}</div>
              <div className="text-gray-300">저가:</div>
              <div className="text-blue-400">{formatPrice(candles[hoveredPoint].data.low_price)}</div>
              <div className="text-gray-300">종가:</div>
              <div>{formatPrice(candles[hoveredPoint].data.close_price)}</div>
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-gray-800"></div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      to={`/etf/${etf.ticker}`}
      className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-lg"
      aria-label={`${etf.name} 상세 정보 보기`}
    >
      <article className="card-interactive animate-fadeInUp">
        {/* 헤더: 종목명 + 타입 뱃지 */}
        <header className="mb-3">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-bold flex-1 leading-tight group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors text-gray-900 dark:text-gray-100">
              {etf.name}
            </h3>
            <span
              className={`badge ${
                etf.type === 'ETF' ? 'badge-primary' : 'badge-info'
              } ml-2 flex-shrink-0`}
              role="status"
              aria-label={`상품 유형: ${etf.type}`}
            >
              {etf.type}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{etf.theme}</p>
        </header>

        {/* 가격 정보 */}
        {isLoading ? (
          <div className="py-4 space-y-2">
            <div className="skeleton-text h-5"></div>
            <div className="skeleton-text h-4 w-3/4"></div>
            <div className="skeleton-text h-4 w-1/2"></div>
          </div>
        ) : latestPrice ? (
          <div className="mb-4 py-3 border-t border-b border-gray-100 dark:border-gray-700">
            {/* 종가 & 등락률 */}
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatPrice(latestPrice.close_price)}</span>
              <span className={`text-sm font-semibold ${getPriceChangeColor(latestPrice.daily_change_pct)}`}>
                {formatPercent(latestPrice.daily_change_pct)}
              </span>
            </div>

            {/* 시가/고가/저가 */}
            <div className="grid grid-cols-3 gap-2 mb-2 text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-400">시가</span>
                <div className="font-medium text-gray-900 dark:text-gray-100">{formatPrice(latestPrice.open_price)}</div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">고가</span>
                <div className="font-medium text-red-600 dark:text-red-400">{formatPrice(latestPrice.high_price)}</div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">저가</span>
                <div className="font-medium text-blue-600 dark:text-blue-400">{formatPrice(latestPrice.low_price)}</div>
              </div>
            </div>

            {/* 거래량 & 주간수익률 */}
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-2">
              <span>거래량: {formatVolume(latestPrice.volume)}</span>
              {weeklyReturn !== null && (
                <span className={`font-semibold ${getPriceChangeColor(weeklyReturn)}`}>
                  주간: {formatPercent(weeklyReturn)}
                </span>
              )}
              {purchaseReturn !== null && (
                <span className={`font-semibold ${getPriceChangeColor(purchaseReturn)}`}>
                  매입 대비: {formatPercent(purchaseReturn)}
                </span>
              )}
            </div>

            {/* 미니 차트 (전체 너비) */}
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              {renderMiniChart()}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
            가격 정보 없음
          </div>
        )}

        {/* 매매 동향 */}
        {latestTradingFlow && (
          <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">매매 동향 ({latestTradingFlow.date})</div>
            <div className="grid grid-cols-3 gap-1 text-xs">
              <div className="text-center">
                <div className="text-gray-500 dark:text-gray-400">개인</div>
                <div className={`font-semibold ${latestTradingFlow.individual_net > 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {formatTradingValue(latestTradingFlow.individual_net)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 dark:text-gray-400">기관</div>
                <div className={`font-semibold ${latestTradingFlow.institutional_net > 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {formatTradingValue(latestTradingFlow.institutional_net)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 dark:text-gray-400">외국인</div>
                <div className={`font-semibold ${latestTradingFlow.foreign_net > 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {formatTradingValue(latestTradingFlow.foreign_net)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 뉴스 */}
        {actualNews && actualNews.length > 0 && (
          <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500 dark:text-gray-400">최근 뉴스</span>
              <span className="badge badge-primary">{actualNews.length}건</span>
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-300 truncate-2-lines">{actualNews[0].title}</div>
          </div>
        )}

        {/* 하단 정보 */}
        <footer className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
          <span aria-label={`종목 코드: ${etf.ticker}`}>{etf.ticker}</span>
        </footer>
      </article>
    </Link>
  )
})

ETFCard.displayName = 'ETFCard'

ETFCard.propTypes = {
  etf: PropTypes.shape({
    ticker: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['ETF', 'STOCK', 'ALL']).isRequired,
    theme: PropTypes.string,
    purchase_date: PropTypes.string,
    purchase_price: PropTypes.number,
    quantity: PropTypes.number,
  }).isRequired,
  summary: PropTypes.shape({
    ticker: PropTypes.string,
    latest_price: PropTypes.object,
    prices: PropTypes.array,
    weekly_return: PropTypes.number,
    latest_trading_flow: PropTypes.object,
    latest_news: PropTypes.array,
  }),
}

export default ETFCard
