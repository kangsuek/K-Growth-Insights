import { useMemo, memo, useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import { formatPrice, formatVolume, getPriceChangeColorHex } from '../../utils/format'
import { useContainerWidth } from '../../hooks/useContainerWidth'
import { useWindowSize } from '../../hooks/useWindowSize'
import { sampleData, validateChartData } from '../../utils/chartUtils'
import { COLORS, MAX_CHART_POINTS } from '../../constants'

/**
 * CustomTooltip: 캔들스틱 차트 툴팁
 */
const CustomTooltip = ({ active, payload, baseline }) => {
  if (!active || !payload || payload.length === 0) return null
  const data = payload[0].payload
  const baselineChangePct = baseline ? ((data.close_price - baseline.close_price) / baseline.close_price) * 100 : null

  return (
    <div className="bg-white dark:bg-gray-800 p-3 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg transition-colors">
      <p className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
        {data.date ? format(new Date(data.date), 'yyyy-MM-dd') : '-'}
      </p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">종가:</span>
          <span className="font-bold text-black dark:text-gray-100">{formatPrice(data.close_price)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">시가:</span>
          <span className="font-semibold text-green-600 dark:text-green-400">{formatPrice(data.open_price)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">고가:</span>
          <span className="font-semibold text-red-600 dark:text-red-400">{formatPrice(data.high_price)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">저가:</span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">{formatPrice(data.low_price)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">거래량:</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{formatVolume(data.volume)}</span>
        </div>
        {data.daily_change_pct != null && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-600 dark:text-gray-400">등락률:</span>
            <span className="font-semibold" style={{ color: getPriceChangeColorHex(data.daily_change_pct) }}>
              {data.daily_change_pct > 0 ? '+' : ''}{data.daily_change_pct.toFixed(2)}%
            </span>
          </div>
        )}
        {baselineChangePct != null && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-600 dark:text-gray-400">기준일({format(new Date(baseline.date), 'MM/dd')}) 대비:</span>
            <span className="font-semibold" style={{ color: getPriceChangeColorHex(baselineChangePct) }}>
              {baselineChangePct > 0 ? '+' : ''}{baselineChangePct.toFixed(2)}%
            </span>
          </div>
        )}
        {(data.ma5 || data.ma10 || data.ma20) && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
            {data.ma5 && <div className="flex justify-between gap-4"><span style={{ color: COLORS.MA_5 }}>MA5:</span><span className="font-semibold" style={{ color: COLORS.MA_5 }}>{formatPrice(data.ma5)}</span></div>}
            {data.ma10 && <div className="flex justify-between gap-4"><span style={{ color: COLORS.MA_10 }}>MA10:</span><span className="font-semibold" style={{ color: COLORS.MA_10 }}>{formatPrice(data.ma10)}</span></div>}
            {data.ma20 && <div className="flex justify-between gap-4"><span style={{ color: COLORS.MA_20 }}>MA20:</span><span className="font-semibold" style={{ color: COLORS.MA_20 }}>{formatPrice(data.ma20)}</span></div>}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * PriceChart 컴포넌트
 * 캔들스틱 차트 (상단) + 거래량 바 차트 (하단) 조합
 */
const PriceChart = memo(function PriceChart({ data = [], ticker, height = null, dateRange = '7d', scrollRef, onScroll, purchasePrice = null }) {
  const [showMA5, setShowMA5] = useState(false)
  const [showMA10, setShowMA10] = useState(false)
  const [showMA20, setShowMA20] = useState(false)
  const [baseline, setBaseline] = useState(null)

  const handleChartClick = (state) => {
    const point = state?.activePayload?.[0]?.payload
    if (point) setBaseline({ date: point.date, close_price: point.close_price })
  }

  const handleChartContextMenu = (state, event) => {
    event.preventDefault()
    setBaseline(null)
  }

  useEffect(() => {
    setBaseline(null)
  }, [ticker])

  const { containerRef, width: containerWidth } = useContainerWidth()
  const { chartHeight: responsiveHeight } = useWindowSize()
  const finalHeight = height || responsiveHeight

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []

    const validation = validateChartData(data, ['date', 'close_price', 'volume'])
    if (!validation.isValid) return []

    const filteredData = data.filter(p => {
      const dayOfWeek = new Date(p.date).getDay()
      return dayOfWeek !== 0 && dayOfWeek !== 6
    })

    const sortedData = filteredData.sort((a, b) => new Date(a.date) - new Date(b.date))
    const sampledData = sampleData(sortedData, MAX_CHART_POINTS)

    const calculateMA = (period) =>
      sampledData.map((item, index) => {
        if (index < period - 1) return null
        const sum = sampledData.slice(index - period + 1, index + 1).reduce((acc, p) => acc + p.close_price, 0)
        return sum / period
      })

    const ma5 = calculateMA(5)
    const ma10 = calculateMA(10)
    const ma20 = calculateMA(20)

    return sampledData.map((item, index) => ({
      ...item,
      volumeColor: item.close_price >= item.open_price ? COLORS.VOLUME_UP : COLORS.VOLUME_DOWN,
      ma5: ma5[index],
      ma10: ma10[index],
      ma20: ma20[index],
    }))
  }, [data])

  if (!chartData || chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg"
        style={{ height: `${finalHeight}px` }}
      >
        <p className="text-gray-500 dark:text-gray-400">표시할 가격 데이터가 없습니다.</p>
      </div>
    )
  }

  // Y축 도메인 (가격)
  const prices = chartData.flatMap(d => [d.open_price, d.high_price, d.low_price, d.close_price])
  const minPrice = Math.min(...prices.filter(p => p != null))
  const maxPrice = Math.max(...prices.filter(p => p != null))
  const priceMargin = (maxPrice - minPrice) * 0.1
  const priceDomain = [Math.floor(minPrice - priceMargin), Math.ceil(maxPrice + priceMargin)]

  // Y축 도메인 (거래량)
  const maxVolume = Math.max(...chartData.map(d => d.volume).filter(v => v != null))
  const volumeDomain = [0, Math.ceil(maxVolume * 1.2)]

  // X축 포맷
  const formatXAxis = (val) => {
    try { return format(new Date(val), 'MM/dd') } catch { return val }
  }

  // 캔들스틱 커스텀 렌더러 (priceDomain 클로저)
  const renderCandlestick = (props) => {
    const { x, y, width, height: barH, payload } = props
    if (!payload?.high_price || barH <= 0) return null

    const { open_price, high_price, low_price, close_price } = payload
    const isRising = close_price >= open_price
    const color = isRising ? '#ef4444' : '#3b82f6'

    // y = pixel of high_price, y+barH = pixel of priceDomain[0]
    const range = high_price - priceDomain[0]
    if (range <= 0) return null
    const toPixel = (price) => y + barH - ((price - priceDomain[0]) / range) * barH

    const highPx = y
    const lowPx = toPixel(low_price)
    const openPx = toPixel(open_price)
    const closePx = toPixel(close_price)

    const bodyTop = Math.min(openPx, closePx)
    const bodyH = Math.max(1, Math.abs(closePx - openPx))
    const cx = x + width / 2
    const bodyW = Math.max(3, width * 0.65)

    return (
      <g>
        {/* 위 꼬리 */}
        <line x1={cx} y1={highPx} x2={cx} y2={bodyTop} stroke={color} strokeWidth={1} />
        {/* 캔들 몸체 */}
        <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} stroke={color} strokeWidth={1} />
        {/* 아래 꼬리 */}
        <line x1={cx} y1={bodyTop + bodyH} x2={cx} y2={lowPx} stroke={color} strokeWidth={1} />
      </g>
    )
  }

  // 차트 너비 / 스크롤 여부
  const dataCount = chartData.length
  const is7Days = dateRange === '7d' && dataCount <= 7
  const shouldShowScroll = !is7Days

  const chartPixelWidth = is7Days
    ? (containerWidth > 0 ? containerWidth : 800)
    : Math.max(800, dataCount * 30)

  const barCategoryGap = dataCount > 30 ? '1%' : dataCount > 15 ? '2%' : '5%'

  // 가격 / 거래량 차트 높이 분배 (72% / 28%)
  const priceH = Math.round(finalHeight * 0.72)
  const volumeH = Math.round(finalHeight * 0.28)

  const sharedMargin = { top: 8, right: 15, left: 15, bottom: 0 }
  const volumeMargin = { top: 4, right: 15, left: 15, bottom: dataCount > 15 ? 60 : 20 }

  return (
    <div
      ref={(node) => {
        containerRef.current = node
        if (scrollRef) scrollRef.current = node
      }}
      className={`w-full ${shouldShowScroll ? 'overflow-x-auto' : ''}`}
      onScroll={onScroll}
      role="img"
      aria-label={`${ticker} 가격 차트`}
    >
      <div style={{ width: `${chartPixelWidth}px`, minWidth: '100%' }}>

        {/* ── 가격 차트 (캔들스틱 + 이동평균선) ── */}
        <ResponsiveContainer width="100%" height={priceH}>
          <ComposedChart
            data={chartData}
            margin={sharedMargin}
            barCategoryGap={barCategoryGap}
            onClick={handleChartClick}
            onContextMenu={handleChartContextMenu}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} />
            <XAxis dataKey="date" hide />
            <YAxis
              orientation="left"
              tickFormatter={(v) => formatPrice(v)}
              tick={{ fontSize: 12 }}
              stroke={COLORS.CHART_AXIS}
              domain={priceDomain}
            />
            <Tooltip
              content={<CustomTooltip baseline={baseline} />}
              cursor={{ stroke: COLORS.CHART_CURSOR, strokeWidth: 1, strokeDasharray: '5 5' }}
              isAnimationActive={false}
              wrapperStyle={{ outline: 'none' }}
              contentStyle={{ backgroundColor: 'transparent', border: 'none', padding: 0, boxShadow: 'none' }}
            />

            {/* 캔들스틱 */}
            <Bar dataKey="high_price" shape={renderCandlestick} isAnimationActive={false} legendType="none" />

            {/* 종가 선 */}
            <Line type="monotone" dataKey="close_price" stroke={COLORS.CHART_PRIMARY} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} legendType="none" />

            {/* 이동평균선 */}
            {showMA5 && <Line type="monotone" dataKey="ma5" stroke={COLORS.MA_5} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} legendType="none" />}
            {showMA10 && <Line type="monotone" dataKey="ma10" stroke={COLORS.MA_10} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} legendType="none" />}
            {showMA20 && <Line type="monotone" dataKey="ma20" stroke={COLORS.MA_20} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} legendType="none" />}

            {/* 매입가 기준선 */}
            {purchasePrice && (
              <ReferenceLine
                y={purchasePrice}
                stroke="#22c55e"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{ value: `매입가: ${formatPrice(purchasePrice)}`, position: 'insideTopRight', fill: '#22c55e', fontSize: 12, fontWeight: 'bold' }}
              />
            )}

            {/* 기준일 기준선 (클릭으로 지정, 우클릭으로 해제) */}
            {baseline && (
              <ReferenceLine
                y={baseline.close_price}
                stroke="#3b82f6"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{ value: `기준일(${format(new Date(baseline.date), 'MM/dd')}): ${formatPrice(baseline.close_price)}`, position: 'insideBottomRight', fill: '#3b82f6', fontSize: 12, fontWeight: 'bold' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* ── 거래량 차트 ── */}
        <ResponsiveContainer width="100%" height={volumeH}>
          <ComposedChart data={chartData} margin={volumeMargin} barCategoryGap={barCategoryGap}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxis}
              tick={{ fontSize: 12 }}
              stroke={COLORS.CHART_AXIS}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              orientation="left"
              tickFormatter={(v) => formatVolume(v)}
              tick={{ fontSize: 10 }}
              stroke={COLORS.CHART_AXIS}
              domain={volumeDomain}
              width={55}
            />
            <Bar dataKey="volume" isAnimationActive={false} legendType="none">
              {chartData.map((entry, i) => (
                <Cell key={`vol-${i}`} fill={entry.volumeColor} opacity={0.7} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>

        {/* ── 범례 ── */}
        <div className="flex justify-center gap-6 pt-2 pb-2 text-sm flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-500"></span>
            <span className="text-gray-600 dark:text-gray-400">양봉 (상승)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-500"></span>
            <span className="text-gray-600 dark:text-gray-400">음봉 (하락)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-0.5" style={{ backgroundColor: COLORS.CHART_PRIMARY }}></span>
            <span className="text-gray-600 dark:text-gray-400" style={{ color: COLORS.CHART_PRIMARY }}>종가</span>
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showMA5} onChange={(e) => setShowMA5(e.target.checked)} className="w-4 h-4 cursor-pointer" />
            <span className="inline-block w-6 h-0.5" style={{ backgroundColor: COLORS.MA_5 }}></span>
            <span style={{ color: COLORS.MA_5 }}>5일 MA</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showMA10} onChange={(e) => setShowMA10(e.target.checked)} className="w-4 h-4 cursor-pointer" />
            <span className="inline-block w-6 h-0.5" style={{ backgroundColor: COLORS.MA_10 }}></span>
            <span style={{ color: COLORS.MA_10 }}>10일 MA</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showMA20} onChange={(e) => setShowMA20(e.target.checked)} className="w-4 h-4 cursor-pointer" />
            <span className="inline-block w-6 h-0.5" style={{ backgroundColor: COLORS.MA_20 }}></span>
            <span style={{ color: COLORS.MA_20 }}>20일 MA</span>
          </label>

          {purchasePrice && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-6 h-0.5 border-t-2 border-dashed border-green-500"></span>
              <span className="text-green-500">매입가: {formatPrice(purchasePrice)}</span>
            </div>
          )}

          {baseline && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-6 h-0.5 border-t-2 border-dashed border-blue-500"></span>
              <span className="text-blue-500">기준일({format(new Date(baseline.date), 'MM/dd')}): {formatPrice(baseline.close_price)}</span>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 pb-1">
          차트 클릭: 기준일 지정 · 우클릭: 기준일 해제
        </p>

      </div>
    </div>
  )
})

PriceChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string.isRequired,
      open_price: PropTypes.number.isRequired,
      high_price: PropTypes.number.isRequired,
      low_price: PropTypes.number.isRequired,
      close_price: PropTypes.number.isRequired,
      volume: PropTypes.number.isRequired,
      daily_change_pct: PropTypes.number,
    })
  ),
  ticker: PropTypes.string.isRequired,
  height: PropTypes.number,
  dateRange: PropTypes.oneOf(['7d', '1m', '3m', 'custom']),
  scrollRef: PropTypes.object,
  onScroll: PropTypes.func,
  purchasePrice: PropTypes.number,
}

export default PriceChart
