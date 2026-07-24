import { useMemo, memo } from 'react'
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
import { formatPrice, formatVolume, getPriceChangeColorHex } from '../../utils/format'
import { useContainerWidth } from '../../hooks/useContainerWidth'
import { COLORS } from '../../constants'

/**
 * CustomTooltip 컴포넌트 - 분봉 차트 전용 툴팁
 */
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const data = payload[0].payload

  // datetime에서 시간만 추출
  const time = data.datetime ? data.datetime.split('T')[1]?.substring(0, 5) : '-'

  return (
    <div className="bg-white dark:bg-gray-800 p-3 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg transition-colors">
      <p className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
        {time}
      </p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">체결가:</span>
          <span className="font-bold text-black dark:text-gray-100">{formatPrice(data.price)}</span>
        </div>
        {data.change_amount !== null && data.change_amount !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-600 dark:text-gray-400">전일비:</span>
            <span
              className="font-semibold"
              style={{ color: getPriceChangeColorHex(data.change_amount) }}
            >
              {data.change_amount > 0 ? '+' : ''}
              {formatPrice(data.change_amount)}
              {data.change_pct !== null && data.change_pct !== undefined && (
                <> ({data.change_pct > 0 ? '+' : ''}{data.change_pct.toFixed(2)}%)</>
              )}
            </span>
          </div>
        )}
        {data.volume && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-600 dark:text-gray-400">거래량:</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {formatVolume(data.volume)}
            </span>
          </div>
        )}
        {data.bid_volume && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-600 dark:text-gray-400">매수잔량:</span>
            <span className="font-semibold text-red-600 dark:text-red-400">
              {formatVolume(data.bid_volume)}
            </span>
          </div>
        )}
        {data.ask_volume && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-600 dark:text-gray-400">매도잔량:</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {formatVolume(data.ask_volume)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * IntradayChart 컴포넌트
 * 분봉(시간별 체결) 데이터를 시각화하는 차트
 *
 * @param {Array} data - 분봉 데이터 배열
 * @param {string} ticker - 종목 코드
 * @param {number} height - 차트 높이 (기본값: 300)
 * @param {boolean} showVolume - 거래량 표시 여부
 * @param {number} previousClose - 전일 종가 (기준선 표시용)
 */
const IntradayChart = memo(function IntradayChart({
  data = [],
  ticker,
  height = 300,
  showVolume = true,
  previousClose = null,
  pivotLevels = null,
  fitToWidth = false,
}) {
  // 컨테이너 너비 측정
  const { containerRef, width: containerWidth } = useContainerWidth()

  // 데이터 전처리 및 메모이제이션
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []

    // 시간순 정렬 확인 (이미 정렬되어 있어야 함)
    const sortedData = [...data].sort((a, b) => {
      const timeA = new Date(a.datetime).getTime()
      const timeB = new Date(b.datetime).getTime()
      return timeA - timeB
    })

    // 거래량 막대 색: 직전 분봉 대비 등락(틱 방향)으로 판정한다.
    // 상승(빨강)/하락(파랑), 변동 없으면 직전 방향을 유지한다(HTS 관례).
    // 첫 봉은 직전이 없어 자기 시가 대비 종가로 시드한다.
    let prevPrice = null
    let prevRising = sortedData.length > 0 && sortedData[0].open_price != null
      ? sortedData[0].price >= sortedData[0].open_price
      : true

    return sortedData.map((item) => {
      let isRising = prevRising
      if (prevPrice != null && item.price != null) {
        if (item.price > prevPrice) isRising = true
        else if (item.price < prevPrice) isRising = false
        // 같으면 직전 방향 유지
      }
      prevPrice = item.price
      prevRising = isRising
      const volumeColor = isRising ? COLORS.VOLUME_UP : COLORS.VOLUME_DOWN

      // datetime에서 시간만 추출 (HH:MM 형식)
      const time = item.datetime.split('T')[1]?.substring(0, 5) || item.datetime

      return {
        ...item,
        time,
        volumeColor,
      }
    })
  }, [data])

  // 표시할 피봇 레벨 결정
  const visiblePivotLevels = useMemo(() => {
    if (!pivotLevels) return []
    const prices = chartData.map((d) => d.price).filter((p) => p != null)
    if (prices.length === 0) return []
    const dataMin = Math.min(...prices)
    const dataMax = Math.max(...prices)
    const range = dataMax - dataMin
    const expandedMin = dataMin - range * 0.3
    const expandedMax = dataMax + range * 0.3

    const levels = [
      { key: 'r1', label: 'R1', value: pivotLevels.r1, color: '#f87171', dash: '5 5', width: 1 },
      { key: 'r2', label: 'R2', value: pivotLevels.r2, color: '#ef4444', dash: '4 4', width: 1 },
      { key: 'r3', label: 'R3', value: pivotLevels.r3, color: '#dc2626', dash: '3 3', width: 0.8 },
      { key: 'pp', label: 'PP', value: pivotLevels.pp, color: '#8b5cf6', dash: '6 3', width: 1.5 },
      { key: 's1', label: 'S1', value: pivotLevels.s1, color: '#60a5fa', dash: '5 5', width: 1 },
      { key: 's2', label: 'S2', value: pivotLevels.s2, color: '#3b82f6', dash: '4 4', width: 1 },
      { key: 's3', label: 'S3', value: pivotLevels.s3, color: '#2563eb', dash: '3 3', width: 0.8 },
    ]

    // PP, R1, R2, S1, S2는 기본 표시. R3/S3는 범위 내일 때만
    return levels.filter(l => {
      if (l.value == null) return false
      if (l.key === 'r3' || l.key === 's3') {
        return l.value >= expandedMin && l.value <= expandedMax
      }
      return true
    })
  }, [pivotLevels, chartData])

  // X축 틱 간격 계산 (약 6-8개 틱)
  const tickInterval = Math.max(1, Math.floor(chartData.length / 7))

  // X축 틱 배열 생성 (첫 번째와 마지막 시간 포함, 중복 제거)
  const xAxisTicks = useMemo(() => {
    if (!chartData || chartData.length === 0) return []
    
    const firstTime = chartData[0]?.time
    const lastTime = chartData[chartData.length - 1]?.time
    
    if (!firstTime || !lastTime) return []
    
    // 중복 방지를 위해 Set 사용
    const ticksSet = new Set()
    const ticks = []
    
    // 첫 번째 시간 추가
    if (firstTime) {
      ticksSet.add(firstTime)
      ticks.push(firstTime)
    }
    
    // 중간 틱 추가 (간격에 따라, 마지막 제외)
    for (let i = tickInterval; i < chartData.length - 1; i += tickInterval) {
      const time = chartData[i].time
      if (time && !ticksSet.has(time)) {
        ticksSet.add(time)
        ticks.push(time)
      }
    }
    
    // 마지막 시간 추가 (중복이 아닌 경우에만)
    if (lastTime && !ticksSet.has(lastTime)) {
      ticks.push(lastTime)
    }
    
    return ticks
  }, [chartData, tickInterval])

  // 데이터 없음 상태 처리
  if (!chartData || chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg transition-colors"
        style={{ height: `${height}px` }}
        role="img"
        aria-label="분봉 차트 - 데이터 없음"
      >
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400">분봉 데이터가 없습니다.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            장중이 아니거나 휴장일입니다.
          </p>
        </div>
      </div>
    )
  }

  // Y축 도메인 계산 (가격 + 피봇 레벨 포함)
  const prices = chartData.map((d) => d.price).filter((p) => p != null)
  const allPriceValues = [
    ...prices,
    ...visiblePivotLevels.map(l => l.value),
    ...(previousClose != null ? [previousClose] : []),
  ]
  const minPrice = Math.min(...allPriceValues)
  const maxPrice = Math.max(...allPriceValues)
  const priceMargin = (maxPrice - minPrice) * 0.05 || maxPrice * 0.01
  const priceDomain = [
    Math.floor(minPrice - priceMargin),
    Math.ceil(maxPrice + priceMargin),
  ]

  // Y축 도메인 계산 (거래량)
  // 개장 첫 봉 등 거래량 급증이 축 최대치를 지배하면 나머지 막대가 눌려 안 보인다.
  // 95백분위를 상한으로 써서 일반 막대가 충분한 높이를 갖게 하고, 이를 넘는 급증
  // 봉은 패널 상단에서 잘리게 둔다(HTS·일반 차트 관례).
  const volumes = chartData.map((d) => d.volume).filter((v) => v != null)
  const maxVolume = Math.max(...volumes) || 0
  const sortedVolumes = [...volumes].sort((a, b) => a - b)
  const p95Volume = sortedVolumes.length
    ? sortedVolumes[Math.min(sortedVolumes.length - 1, Math.floor(sortedVolumes.length * 0.95))]
    : 0
  const volumeDomain = [0, Math.ceil((p95Volume || maxVolume) * 1.1) || 1]

  // 체결가 라인 색을 전일 종가 기준으로 분할한다(HTS 방식: 위=빨강, 아래=파랑).
  // 그라디언트는 라인 path의 bbox(=실제 가격 min~max)를 0~1로 쓰므로, 전일 종가가
  // 그 안에서 차지하는 위치를 분할 offset으로 계산한다. 라인이 전부 위/아래면 단색.
  const lineMin = prices.length ? Math.min(...prices) : 0
  const lineMax = prices.length ? Math.max(...prices) : 0
  const splitOffset = previousClose != null && lineMax > lineMin
    ? Math.min(1, Math.max(0, (lineMax - previousClose) / (lineMax - lineMin)))
    : null
  const gradientId = `intraday-price-${ticker}`

  // 공유 툴팁 설정(가격·거래량 패널에 동일 적용).
  const tooltipProps = {
    content: <CustomTooltip />,
    cursor: { stroke: COLORS.CHART_CURSOR, strokeWidth: 1, strokeDasharray: '5 5' },
    isAnimationActive: false,
    wrapperStyle: { outline: 'none' },
    contentStyle: { backgroundColor: 'transparent', border: 'none', padding: 0, boxShadow: 'none' },
  }

  // 가격 / 거래량 패널 높이 분배(HTS처럼 하단에 거래량 별도 패널). 두 패널의 Y축
  // 폭(60)과 좌우 여백을 맞춰 플롯 영역을 세로로 정렬한다.
  const AXIS_WIDTH = 60
  const priceH = showVolume ? Math.round(height * 0.72) : height
  const volumeH = Math.round(height * 0.28)
  const pricePanelMargin = { top: 10, right: 15, left: 0, bottom: 0 }
  const volumePanelMargin = { top: 4, right: 15, left: 0, bottom: 20 }

  // 거래량 막대 폭을 10px로 고정한다. 봉 수 × (막대폭+간격)이 컨테이너보다 넓으면
  // 가로 스크롤한다(HTS처럼). Y축 폭만큼 여유를 더해 플롯 영역이 잘리지 않게 한다.
  // fitToWidth면 고정폭·스크롤 없이 컨테이너 폭에 전체 세션을 맞춘다(한 화면 보기).
  const BAR_WIDTH = 10
  const chartPixelWidth = AXIS_WIDTH + chartData.length * (BAR_WIDTH + 1) + 20
  const needScroll = !fitToWidth && chartPixelWidth > (containerWidth || 0)
  const innerStyle = fitToWidth
    ? { width: '100%' }
    : { width: `${chartPixelWidth}px`, minWidth: '100%' }

  return (
    <div
      ref={containerRef}
      className={`w-full ${needScroll ? 'overflow-x-auto' : ''}`}
      role="img"
      aria-label={`${ticker} 분봉 차트`}
    >
      <div style={innerStyle}>
      {/* ── 가격 패널 ── */}
      <ResponsiveContainer width="100%" height={priceH}>
        <ComposedChart data={chartData} margin={pricePanelMargin}>
          {/* 전일 종가 기준 상·하단을 빨강/파랑으로 나누는 세로 그라디언트 */}
          {splitOffset != null && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={splitOffset} stopColor={COLORS.PRICE_UP} />
                <stop offset={splitOffset} stopColor={COLORS.PRICE_DOWN} />
              </linearGradient>
            </defs>
          )}
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} />
          <XAxis dataKey="time" hide />
          <YAxis
            orientation="left"
            tickFormatter={formatPrice}
            tick={{ fontSize: 11 }}
            stroke={COLORS.CHART_AXIS}
            domain={priceDomain}
            width={AXIS_WIDTH}
          />
          <Tooltip {...tooltipProps} />

          {/* 가격 Line — 전일 종가 위=빨강/아래=파랑 (기준가 모르면 단색) */}
          <Line
            type="monotone"
            dataKey="price"
            stroke={splitOffset != null ? `url(#${gradientId})` : COLORS.CHART_PRIMARY}
            strokeWidth={1.5}
            dot={false}
            name="체결가"
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />

          {/* 전일 종가 기준선 */}
          {previousClose && (
            <ReferenceLine
              y={previousClose}
              stroke="#9ca3af"
              strokeDasharray="5 5"
              strokeWidth={1}
              label={{
                value: `전일 ${formatPrice(previousClose)}`,
                position: 'insideTopRight',
                fill: '#9ca3af',
                fontSize: 10,
              }}
            />
          )}

          {/* 피봇 레벨 수평선 */}
          {visiblePivotLevels.map((level) => (
            <ReferenceLine
              key={level.key}
              y={level.value}
              stroke={level.color}
              strokeDasharray={level.dash}
              strokeWidth={level.width}
              label={{
                value: `${level.label} ${formatPrice(level.value)}`,
                position: 'insideTopLeft',
                fill: level.color,
                fontSize: 9,
              }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* ── 거래량 패널 ── */}
      {showVolume && (
        <ResponsiveContainer width="100%" height={volumeH}>
          <ComposedChart data={chartData} margin={volumePanelMargin}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.CHART_GRID} vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11 }}
              stroke={COLORS.CHART_AXIS}
              interval={0}
              ticks={xAxisTicks}
              angle={-45}
              textAnchor="end"
              height={40}
            />
            <YAxis
              orientation="left"
              tickFormatter={formatVolume}
              tick={{ fontSize: 10 }}
              stroke={COLORS.CHART_AXIS}
              domain={volumeDomain}
              // 기본값이면 축이 데이터 최대에 맞춰 확장돼 상한(p95)이 무시된다.
              // overflow를 허용해 상한을 강제하고, 급증 봉은 상단에서 잘리게 둔다.
              allowDataOverflow
              width={AXIS_WIDTH}
            />
            <Tooltip {...tooltipProps} />
            <Bar dataKey="volume" opacity={0.7} name="거래량" barSize={fitToWidth ? undefined : BAR_WIDTH} isAnimationActive={false}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.volumeColor} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      )}
      </div>

      {/* ── 범례 ── */}
      <div className="flex justify-center gap-6 pt-1 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5" style={{ background: COLORS.CHART_PRIMARY }}></span>
          <span className="text-gray-600 dark:text-gray-400">체결가</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-gray-400 opacity-70"></span>
          <span className="text-gray-600 dark:text-gray-400">거래량</span>
        </div>
      </div>
    </div>
  )
})

IntradayChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      datetime: PropTypes.string.isRequired,
      price: PropTypes.number.isRequired,
      open_price: PropTypes.number,
      change_amount: PropTypes.number,
      change_pct: PropTypes.number,
      volume: PropTypes.number,
      bid_volume: PropTypes.number,
      ask_volume: PropTypes.number,
    })
  ),
  ticker: PropTypes.string.isRequired,
  height: PropTypes.number,
  showVolume: PropTypes.bool,
  fitToWidth: PropTypes.bool,
  previousClose: PropTypes.number,
  pivotLevels: PropTypes.shape({
    pp: PropTypes.number,
    r1: PropTypes.number,
    r2: PropTypes.number,
    r3: PropTypes.number,
    s1: PropTypes.number,
    s2: PropTypes.number,
    s3: PropTypes.number,
  }),
}

export default IntradayChart
