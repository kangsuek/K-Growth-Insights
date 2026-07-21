import { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Treemap, ResponsiveContainer } from 'recharts'
import PropTypes from 'prop-types'

/**
 * 주간수익률 기준 셀 배경색 (한국식: 빨강=상승, 파랑=하락)
 */
const getWeeklyColor = (pct) => {
  if (pct == null || isNaN(pct)) return '#9ca3af'
  if (pct >= 5) return '#991b1b'
  if (pct >= 3) return '#dc2626'
  if (pct >= 1) return '#ef4444'
  if (pct >= 0) return '#fca5a5'
  if (pct >= -1) return '#93c5fd'
  if (pct >= -3) return '#3b82f6'
  if (pct >= -5) return '#1d4ed8'
  return '#1e3a8a'
}

const getTextColor = (pct) => {
  if (pct == null || isNaN(pct)) return '#374151'
  if (pct >= 0 && pct < 1) return '#1f2937'
  if (pct < 0 && pct >= -1) return '#1f2937'
  return '#ffffff'
}

const formatPrice = (price) => {
  if (price == null) return ''
  return price.toLocaleString('ko-KR')
}

const formatNet = (val) => {
  if (val == null) return '-'
  const prefix = val > 0 ? '+' : ''
  if (Math.abs(val) >= 100000000) return `${prefix}${(val / 100000000).toFixed(1)}억`
  if (Math.abs(val) >= 10000) return `${prefix}${(val / 10000).toFixed(0)}만`
  return `${prefix}${val.toLocaleString('ko-KR')}`
}

const HeatmapCell = (props) => {
  const { x, y, width, height, name, changePct, closePrice, dailyChangePct, foreignNet, institutionalNet, isRegistered, depth } = props

  if (depth !== 1) return null
  if (width < 2 || height < 2) return null

  const bgColor = getWeeklyColor(changePct)
  const textColor = getTextColor(changePct)

  const canShowName = width > 50 && height > 25
  const canShowPrice = width > 60 && height > 45
  const canShowWeekly = width > 40 && height > 20
  const canShowDaily = width > 80 && height > 60

  const maxChars = Math.floor(width / 9)
  const displayName = name && name.length > maxChars
    ? name.slice(0, maxChars - 1) + '..'
    : name

  const weeklyStr = changePct != null
    ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`
    : ''

  const dailyStr = dailyChangePct != null
    ? `일간 ${dailyChangePct >= 0 ? '+' : ''}${dailyChangePct.toFixed(1)}%`
    : ''

  const lines = [canShowName, canShowPrice, canShowWeekly, canShowDaily].filter(Boolean).length
  const lineHeight = 14
  const startY = y + height / 2 - ((lines - 1) * lineHeight) / 2
  let currentLine = 0

  const tooltipText = [
    name,
    closePrice ? `현재가: ${formatPrice(closePrice)}원` : '',
    changePct != null ? `주간: ${weeklyStr}` : '',
    dailyChangePct != null ? `등락: ${dailyStr}` : '',
    foreignNet != null ? `외국인: ${formatNet(foreignNet)}` : '',
    institutionalNet != null ? `기관: ${formatNet(institutionalNet)}` : '',
  ].filter(Boolean).join('\n')

  return (
    <g style={{ cursor: 'pointer' }}>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(width - 2, 0)}
        height={Math.max(height - 2, 0)}
        fill={bgColor}
        rx={4}
        stroke={isRegistered ? '#00e5ff' : 'none'}
        strokeWidth={isRegistered ? 3 : 0}
      />
      <title>{tooltipText}</title>
      {canShowName && (
        <text
          x={x + width / 2}
          y={startY + lineHeight * currentLine++}
          textAnchor="middle"
          dominantBaseline="central"
          fill={textColor}
          fontSize={11}
          fontWeight="600"
          style={{ pointerEvents: 'none' }}
        >
          {displayName}
        </text>
      )}
      {canShowPrice && closePrice && (
        <text
          x={x + width / 2}
          y={startY + lineHeight * currentLine++}
          textAnchor="middle"
          dominantBaseline="central"
          fill={textColor}
          fontSize={10}
          fontWeight="normal"
          style={{ pointerEvents: 'none' }}
        >
          {formatPrice(closePrice)}원
        </text>
      )}
      {canShowWeekly && (
        <text
          x={x + width / 2}
          y={startY + lineHeight * currentLine++}
          textAnchor="middle"
          dominantBaseline="central"
          fill={textColor}
          fontSize={12}
          fontWeight="bold"
          style={{ pointerEvents: 'none' }}
        >
          {weeklyStr}
        </text>
      )}
      {canShowDaily && dailyChangePct != null && (
        <text
          x={x + width / 2}
          y={startY + lineHeight * currentLine++}
          textAnchor="middle"
          dominantBaseline="central"
          fill={textColor}
          fontSize={9}
          fontWeight="normal"
          opacity={0.85}
          style={{ pointerEvents: 'none' }}
        >
          {dailyStr}
        </text>
      )}
    </g>
  )
}

export default function ScreeningHeatmap({ items }) {
  const navigate = useNavigate()

  const heatmapData = useMemo(() => {
    if (!items || items.length === 0) return []

    // 로그 스케일로 거래량 차이를 완화하고 최소 크기 보장
    // log10(volume) → 대략 4~8 범위로 압축, 최소 1 보장
    return items.map(item => {
      const vol = item.volume || 1
      const logSize = Math.log10(Math.max(vol, 1))
      // 최소 크기 2를 보장하여 아주 작은 셀 방지
      const size = Math.max(logSize, 2)

      return {
        name: item.name,
        ticker: item.ticker,
        size,
        changePct: item.weekly_return,
        closePrice: item.close_price,
        dailyChangePct: item.daily_change_pct,
        foreignNet: item.foreign_net,
        institutionalNet: item.institutional_net,
        isRegistered: item.is_registered,
      }
    })
  }, [items])

  const handleClick = useCallback((node) => {
    if (!node?.ticker) return
    if (node.isRegistered) {
      navigate(`/etf/${node.ticker}`)
    } else {
      navigate('/settings', {
        state: {
          addStock: {
            ticker: node.ticker,
            name: node.name,
            type: 'ETF',
            theme: '',
          },
        },
      })
    }
  }, [navigate])

  if (heatmapData.length === 0) {
    return (
      <div className="card p-8 text-center text-gray-500 dark:text-gray-400">
        <p className="text-sm">표시할 데이터가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#dc2626' }} /> 상승
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#9ca3af' }} /> 보합
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#3b82f6' }} /> 하락
          <span className="ml-2 inline-block w-3 h-3 rounded border-2" style={{ borderColor: '#00e5ff' }} /> 등록 종목
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          셀 크기 = 거래량 | 색상 = 주간수익률
        </span>
      </div>
      <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer>
          <Treemap
            data={heatmapData}
            dataKey="size"
            ratio={4 / 3}
            content={<HeatmapCell />}
            onClick={handleClick}
            isAnimationActive={false}
          />
        </ResponsiveContainer>
      </div>
    </div>
  )
}

ScreeningHeatmap.propTypes = {
  items: PropTypes.array.isRequired,
}
