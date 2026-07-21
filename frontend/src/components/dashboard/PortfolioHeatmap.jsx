import { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Treemap, ResponsiveContainer } from 'recharts'
import PropTypes from 'prop-types'

/**
 * 일간 변동률에 따른 셀 배경색
 * @param {number} changePct - 일간 변동률 (%)
 * @returns {string} hex color
 */
const getChangeColor = (changePct) => {
  if (changePct == null || isNaN(changePct)) return '#9ca3af'
  if (changePct >= 3) return '#15803d'
  if (changePct >= 1.5) return '#16a34a'
  if (changePct >= 0.5) return '#22c55e'
  if (changePct >= 0) return '#86efac'
  if (changePct >= -0.5) return '#fca5a5'
  if (changePct >= -1.5) return '#ef4444'
  if (changePct >= -3) return '#dc2626'
  return '#991b1b'
}

/**
 * 배경색 대비 텍스트 색상
 * @param {number} changePct - 일간 변동률 (%)
 * @returns {string} hex color
 */
const getTextColor = (changePct) => {
  if (changePct == null || isNaN(changePct)) return '#374151'
  if (Math.abs(changePct) < 0.5) return '#1f2937'
  return '#ffffff'
}

/**
 * 가격 포맷 (한국 원화)
 * @param {number} price
 * @returns {string}
 */
const formatPrice = (price) => {
  if (!price) return ''
  return price.toLocaleString('ko-KR')
}

/**
 * Treemap 셀 커스텀 렌더러
 * 종목명, 종가, 일간 변동률을 표시
 */
const HeatmapCell = (props) => {
  const { x, y, width, height, name, ticker, changePct, closePrice, weeklyReturn, isInvested, depth, onContextMenu } = props

  // root 노드(depth 0)는 렌더링하지 않음
  if (depth !== 1) return null
  if (width < 2 || height < 2) return null

  const bgColor = getChangeColor(changePct)
  const textColor = getTextColor(changePct)

  // 텍스트 영역 내부 패딩 (상하 4px)
  const padY = 4
  const innerH = Math.max(height - 2, 0)
  const textAreaH = innerH - padY * 2

  // 셀 크기별 표시 레벨 (텍스트 영역 기준)
  const canShowName = width > 50 && textAreaH > 14
  const canShowPrice = width > 60 && textAreaH > 36
  const canShowChange = width > 40 && textAreaH > 14
  const canShowWeekly = width > 60 && textAreaH > 50

  // 셀 폭에 맞게 이름 자르기
  const maxChars = Math.floor(width / 9)
  const displayName = name && name.length > maxChars
    ? name.slice(0, maxChars - 1) + '..'
    : name

  const changeStr = changePct != null
    ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`
    : ''

  const weeklyStr = weeklyReturn != null
    ? `주간 ${weeklyReturn >= 0 ? '+' : ''}${weeklyReturn.toFixed(1)}%`
    : ''

  // 표시할 줄 수에 따라 세로 간격 조정
  const lines = [canShowName, canShowPrice, canShowChange, canShowWeekly].filter(Boolean).length
  const lineHeight = 14
  // 텍스트 블록 중앙 정렬, 패딩 범위 내로 클램핑
  const centerY = y + 1 + padY + textAreaH / 2
  const blockH = (lines - 1) * lineHeight
  const rawStartY = centerY - blockH / 2
  const minStartY = y + 1 + padY + lineHeight / 2
  const maxStartY = y + height - 1 - padY - lineHeight / 2 - blockH
  const startY = Math.max(minStartY, Math.min(rawStartY, maxStartY))
  let currentLine = 0

  // clipPath ID: 셀마다 고유하게
  const clipId = `hm-clip-${Math.round(x)}-${Math.round(y)}`

  // 네이티브 툴팁 텍스트
  const tooltipText = [
    name,
    closePrice ? `종가: ${formatPrice(closePrice)}원` : '',
    `일간: ${changeStr}`,
    weeklyReturn != null ? `주간: ${weeklyStr}` : '',
  ].filter(Boolean).join('\n')

  return (
    <g
      style={{ cursor: 'pointer' }}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(e.clientX, e.clientY, ticker, name)
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={x + 1} y={y + 1} width={Math.max(width - 2, 0)} height={innerH} rx={4} />
        </clipPath>
      </defs>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(width - 2, 0)}
        height={innerH}
        fill={bgColor}
        rx={4}
        stroke={isInvested ? '#00e5ff' : 'none'}
        strokeWidth={isInvested ? 3 : 0}
      />
      <title>{tooltipText}</title>
      <g clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}>
        {canShowName && (
          <text
            x={x + width / 2}
            y={startY + lineHeight * currentLine++}
            textAnchor="middle"
            dominantBaseline="central"
            fill={textColor}
            fontSize={11}
            fontWeight="600"
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
          >
            {formatPrice(closePrice)}원
          </text>
        )}
        {canShowChange && (
          <text
            x={x + width / 2}
            y={startY + lineHeight * currentLine++}
            textAnchor="middle"
            dominantBaseline="central"
            fill={textColor}
            fontSize={12}
            fontWeight="bold"
          >
            {changeStr}
          </text>
        )}
        {canShowWeekly && weeklyReturn != null && (
          <text
            x={x + width / 2}
            y={startY + lineHeight * currentLine++}
            textAnchor="middle"
            dominantBaseline="central"
            fill={textColor}
            fontSize={9}
            fontWeight="normal"
            opacity={0.85}
          >
            {weeklyStr}
          </text>
        )}
      </g>
    </g>
  )
}

/**
 * PortfolioHeatmap Component
 *
 * 대시보드 상단에 표시되는 포트폴리오 히트맵 (Treemap 스타일)
 * - 셀 크기: 투자 종목 3 : 관심 종목 1 비율
 * - 셀 색상: 일간 변동률 (녹색=상승, 적색=하락)
 * - 셀 내용: 종목명, 종가, 일간 변동률, 주간 수익률
 * - 셀 클릭: ETF 상세 페이지로 이동
 *
 * @param {Array} etfs - ETF 종목 배열
 * @param {Object} batchSummary - 배치 요약 데이터 {ticker: summary}
 * @param {Function} onContextMenu - 셀 우클릭 콜백 (x, y, ticker, name)
 */
export default function PortfolioHeatmap({ etfs, batchSummary, onContextMenu }) {
  const navigate = useNavigate()

  const heatmapData = useMemo(() => {
    if (!etfs || etfs.length === 0 || !batchSummary) return []

    const items = []

    for (const etf of etfs) {
      const summary = batchSummary[etf.ticker]
      const latestPrice = summary?.latest_price || summary?.prices?.[0]
      const changePct = latestPrice?.daily_change_pct ?? 0
      const closePrice = latestPrice?.close_price ?? null
      const weeklyReturn = summary?.weekly_return ?? null

      items.push({
        name: etf.name,
        ticker: etf.ticker,
        size: (etf.purchase_price && etf.quantity) ? 3 : 1, // 투자 종목 3 : 관심 종목 1
        changePct: Number(changePct) || 0,
        closePrice,
        weeklyReturn: weeklyReturn != null ? Number(weeklyReturn) : null,
        isInvested: !!(etf.purchase_price && etf.quantity),
      })
    }

    return items
  }, [etfs, batchSummary])

  const handleClick = useCallback((node) => {
    if (node?.ticker) {
      navigate(`/etf/${node.ticker}`)
    }
  }, [navigate])

  if (heatmapData.length === 0) return null

  return (
    <div className="card p-4 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        전체 현황
        <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
          ({heatmapData.length}종목)
        </span>
      </h3>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <Treemap
            data={heatmapData}
            dataKey="size"
            ratio={4 / 3}
            content={<HeatmapCell onContextMenu={onContextMenu} />}
            onClick={handleClick}
            isAnimationActive={false}
          />
        </ResponsiveContainer>
      </div>
    </div>
  )
}

PortfolioHeatmap.propTypes = {
  etfs: PropTypes.array.isRequired,
  batchSummary: PropTypes.object,
  onContextMenu: PropTypes.func,
}
