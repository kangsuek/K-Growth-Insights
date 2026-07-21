import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import PriceChart from '../charts/PriceChart'
import TradingFlowChart from '../charts/TradingFlowChart'
import RSIChart from '../charts/RSIChart'
import MACDChart from '../charts/MACDChart'
import LoadingIndicator from '../common/LoadingIndicator'
import ErrorFallback from '../common/ErrorFallback'

/**
 * 가격을 포맷팅 (천 단위 콤마)
 */
function fmtPrice(val) {
  if (val == null || isNaN(val)) return '-'
  return Math.round(val).toLocaleString('ko-KR')
}

/**
 * RSI 값에 따른 해석 텍스트와 색상을 반환
 */
function getRSIInterpretation(rsiValue) {
  if (rsiValue == null) return null
  if (rsiValue >= 80) return { text: '극단적 과매수 — 강한 매도 시그널', color: 'text-red-600 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900' }
  if (rsiValue >= 70) return { text: '과매수 구간 — 매도 시그널, 조정 가능성', color: 'text-red-600 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900' }
  if (rsiValue >= 50) return { text: '상승 추세 — 매수세가 우위', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900' }
  if (rsiValue >= 30) return { text: '하락 추세 — 매도세가 우위', color: 'text-orange-600 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900' }
  if (rsiValue >= 20) return { text: '과매도 구간 — 매수 시그널, 반등 가능성', color: 'text-blue-600 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900' }
  return { text: '극단적 과매도 — 강한 매수 시그널', color: 'text-blue-600 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900' }
}

/**
 * MACD 데이터에 따른 해석 텍스트와 색상을 반환
 */
function getMACDInterpretation(macdData) {
  if (!macdData || macdData.length < 2) return null
  const validData = macdData.filter(d => d.macd !== null && d.signal !== null)
  if (validData.length < 2) return null

  const last = validData[validData.length - 1]
  const prev = validData[validData.length - 2]

  // 골든크로스 / 데드크로스 판별
  const isGoldenCross = prev.macd <= prev.signal && last.macd > last.signal
  const isDeadCross = prev.macd >= prev.signal && last.macd < last.signal
  const macdAboveSignal = last.macd > last.signal
  const histogramGrowing = last.histogram > prev.histogram

  if (isGoldenCross) return { text: '골든크로스 발생 — MACD가 시그널선 상향 돌파, 상승 전환 시그널', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900', icon: '▲' }
  if (isDeadCross) return { text: '데드크로스 발생 — MACD가 시그널선 하향 돌파, 하락 전환 시그널', color: 'text-red-600 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900', icon: '▼' }
  if (macdAboveSignal && histogramGrowing) return { text: '상승 추세 강화 — MACD가 시그널 위, 히스토그램 확대 중', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900', icon: '▲' }
  if (macdAboveSignal && !histogramGrowing) return { text: '상승 추세 약화 — MACD가 시그널 위이나 모멘텀 감소', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900', icon: '─' }
  if (!macdAboveSignal && !histogramGrowing) return { text: '하락 추세 강화 — MACD가 시그널 아래, 히스토그램 확대 중', color: 'text-red-600 dark:text-red-300', bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900', icon: '▼' }
  if (!macdAboveSignal && histogramGrowing) return { text: '하락 추세 약화 — MACD가 시그널 아래이나 모멘텀 회복', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900', icon: '─' }
  return null
}

/**
 * 기술지표 섹션 (RSI + MACD 차트 + 해석)
 */
function TechnicalIndicatorsSection({ rsiData, macdData, showRSI, showMACD, onToggleRSI, onToggleMACD }) {
  // RSI 현재 값 및 해석
  const currentRSI = useMemo(() => {
    if (!rsiData || rsiData.length === 0) return null
    const last = rsiData[rsiData.length - 1]
    return last?.rsi
  }, [rsiData])

  const rsiInterpretation = useMemo(() => getRSIInterpretation(currentRSI), [currentRSI])

  // MACD 현재 해석
  const macdInterpretation = useMemo(() => getMACDInterpretation(macdData), [macdData])

  // MACD 현재 값
  const currentMACD = useMemo(() => {
    if (!macdData || macdData.length === 0) return null
    const validData = macdData.filter(d => d.macd !== null)
    return validData.length > 0 ? validData[validData.length - 1] : null
  }, [macdData])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 transition-all duration-300 ease-in-out hover:shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">기술지표</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showRSI}
              onChange={onToggleRSI}
              className="w-4 h-4 text-purple-500 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">RSI</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showMACD}
              onChange={onToggleMACD}
              className="w-4 h-4 text-blue-500 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">MACD</span>
          </label>
        </div>
      </div>

      {!showRSI && !showMACD && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
          RSI 또는 MACD를 선택하면 기술지표 차트가 표시됩니다
        </p>
      )}

      {/* RSI 섹션 */}
      {showRSI && rsiData && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">
              RSI (14)
              {currentRSI != null && (
                <span className={`ml-2 font-semibold ${rsiInterpretation?.color || 'text-gray-700 dark:text-gray-300'}`}>
                  {currentRSI.toFixed(1)}
                </span>
              )}
            </h4>
          </div>

          {/* RSI 해석 카드 */}
          {rsiInterpretation && (
            <div className={`rounded-md border px-3 py-2 mb-2 ${rsiInterpretation.bg}`}>
              <p className={`text-sm font-medium ${rsiInterpretation.color}`}>
                {rsiInterpretation.text}
              </p>
            </div>
          )}

          <RSIChart data={rsiData} />

          {/* RSI 읽는 법 설명 */}
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1 bg-gray-50 dark:bg-gray-700/50 rounded-md p-3">
            <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">RSI 읽는 법</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              <p><span className="text-red-600 dark:text-red-300 font-medium">70 이상</span> = 과매수 (매도 고려)</p>
              <p><span className="text-blue-600 dark:text-blue-300 font-medium">30 이하</span> = 과매도 (매수 고려)</p>
              <p><span className="text-green-600 dark:text-green-400 font-medium">50~70</span> = 상승 추세</p>
              <p><span className="text-orange-600 dark:text-orange-300 font-medium">30~50</span> = 하락 추세</p>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mt-1">RSI는 14일간 상승폭과 하락폭의 비율로 0~100 사이의 값을 가집니다.</p>
          </div>
        </div>
      )}

      {/* MACD 섹션 */}
      {showMACD && macdData && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">MACD (12, 26, 9)</h4>
            {currentMACD && (() => {
              const validData = macdData.filter(d => d.macd !== null && d.signal !== null && d.histogram !== null)
              const prev = validData.length >= 2 ? validData[validData.length - 2] : null
              const aboveZero = currentMACD.macd >= 0
              const aboveSignal = currentMACD.macd > currentMACD.signal
              const momentumUp = prev ? currentMACD.histogram > prev.histogram : null
              return (
                <div className="flex flex-wrap gap-1.5">
                  {/* 추세: 0선 기준 */}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${aboveZero ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                    {aboveZero ? '▲' : '▼'} 추세 {aboveZero ? '상승' : '하락'}
                  </span>
                  {/* 신호: 시그널선 기준 */}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${aboveSignal ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                    {aboveSignal ? '● 매수신호' : '● 매도신호'}
                  </span>
                  {/* 모멘텀: 히스토그램 방향 */}
                  {momentumUp !== null && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${momentumUp ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {momentumUp ? '↑ 모멘텀 강화' : '↓ 모멘텀 약화'}
                    </span>
                  )}
                </div>
              )
            })()}
          </div>

          {/* MACD 해석 카드 */}
          {macdInterpretation && (
            <div className={`rounded-md border px-3 py-2 mb-2 ${macdInterpretation.bg}`}>
              <p className={`text-sm font-medium ${macdInterpretation.color}`}>
                {macdInterpretation.icon && <span className="mr-1">{macdInterpretation.icon}</span>}
                {macdInterpretation.text}
              </p>
            </div>
          )}

          <MACDChart data={macdData} />

          {/* MACD 읽는 법 설명 */}
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1 bg-gray-50 dark:bg-gray-700/50 rounded-md p-3">
            <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">배지 읽는 법</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1">
              <div>
                <p className="font-medium text-gray-600 dark:text-gray-400 mb-0.5">① 추세 (0선 기준)</p>
                <p><span className="text-red-600 dark:text-red-400 font-medium">▲ 상승</span> = 단기 &gt; 장기 이평선</p>
                <p><span className="text-blue-600 dark:text-blue-400 font-medium">▼ 하락</span> = 단기 &lt; 장기 이평선</p>
              </div>
              <div>
                <p className="font-medium text-gray-600 dark:text-gray-400 mb-0.5">② 신호 (시그널선 기준)</p>
                <p><span className="text-red-600 dark:text-red-400 font-medium">● 매수신호</span> = MACD가 시그널 위</p>
                <p><span className="text-blue-600 dark:text-blue-400 font-medium">● 매도신호</span> = MACD가 시그널 아래</p>
              </div>
              <div>
                <p className="font-medium text-gray-600 dark:text-gray-400 mb-0.5">③ 모멘텀 (속도)</p>
                <p><span className="text-green-600 dark:text-green-400 font-medium">↑ 강화</span> = 추세 가속 중</p>
                <p><span className="text-gray-600 dark:text-gray-400 font-medium">↓ 약화</span> = 추세 감속 중</p>
              </div>
            </div>
            <p className="text-gray-400 dark:text-gray-500 mt-2 border-t border-gray-200 dark:border-gray-600 pt-1.5">골든크로스(매수↑)/데드크로스(매도↓)는 신호 배지가 바뀌는 순간입니다. 배너에서 확인하세요.</p>
          </div>
        </div>
      )}
    </div>
  )
}

TechnicalIndicatorsSection.propTypes = {
  rsiData: PropTypes.array,
  macdData: PropTypes.array,
  showRSI: PropTypes.bool,
  showMACD: PropTypes.bool,
  onToggleRSI: PropTypes.func,
  onToggleMACD: PropTypes.func,
}

/**
 * 지지선/저항선 카드 섹션
 */
function SupportResistanceSection({ data }) {
  const [showDetail, setShowDetail] = useState(false)

  if (!data) return null

  const { currentPrice, supports, resistances, recentLevels, recentDays } = data

  // 가장 가까운 지지선/저항선 (각 최대 3개)
  const nearSupports = supports.slice(0, 3)
  const nearResistances = resistances.slice(0, 3)

  // 현재가 대비 거리 퍼센트
  const distPercent = (price) => {
    const diff = ((price - currentPrice) / currentPrice) * 100
    return diff >= 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`
  }

  // 가까운 지지/저항 강도 바 계산 (시각적 표현)
  const maxDist = Math.max(
    ...nearResistances.map(r => Math.abs(r.price - currentPrice)),
    ...nearSupports.map(s => Math.abs(s.price - currentPrice)),
    1
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 transition-all duration-300 ease-in-out hover:shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">지지선 / 저항선</h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          현재가 <span className="font-semibold text-gray-900 dark:text-gray-100">{fmtPrice(currentPrice)}</span>원
        </span>
      </div>

      {/* 저항선 (위에서 아래로: 먼 저항 → 가까운 저항) */}
      <div className="space-y-0">
        {/* 저항선 영역 */}
        <div className="mb-1">
          <p className="text-xs font-medium text-red-500 mb-1.5 flex items-center gap-1">
            <span>▲</span> 저항선 (상방 압력)
          </p>
          {nearResistances.length > 0 ? (
            <div className="space-y-1.5">
              {[...nearResistances].reverse().map((r, idx) => {
                const dist = Math.abs(r.price - currentPrice) / maxDist
                return (
                  <div key={`r-${idx}`} className="flex items-center gap-2">
                    <div className="w-28 sm:w-36 text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">{r.label}</span>
                    </div>
                    <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden relative">
                      <div
                        className="h-full bg-red-200 dark:bg-red-900/40 rounded"
                        style={{ width: `${Math.max(dist * 100, 8)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-red-600 dark:text-red-400">
                        {fmtPrice(r.price)}원 ({distPercent(r.price)})
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-1">근접 저항선 없음</p>
          )}
        </div>

        {/* 현재가 라인 */}
        <div className="flex items-center gap-2 my-2.5">
          <div className="w-28 sm:w-36 text-right">
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">현재가</span>
          </div>
          <div className="flex-1 h-7 bg-indigo-50 dark:bg-indigo-900/30 rounded border-2 border-indigo-400 dark:border-indigo-500 relative">
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-300">
              {fmtPrice(currentPrice)}원
            </span>
          </div>
        </div>

        {/* 지지선 영역 */}
        <div className="mt-1">
          <p className="text-xs font-medium text-blue-500 mb-1.5 flex items-center gap-1">
            <span>▼</span> 지지선 (하방 지지)
          </p>
          {nearSupports.length > 0 ? (
            <div className="space-y-1.5">
              {nearSupports.map((s, idx) => {
                const dist = Math.abs(s.price - currentPrice) / maxDist
                return (
                  <div key={`s-${idx}`} className="flex items-center gap-2">
                    <div className="w-28 sm:w-36 text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">{s.label}</span>
                    </div>
                    <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden relative">
                      <div
                        className="h-full bg-blue-200 dark:bg-blue-900/40 rounded"
                        style={{ width: `${Math.max(dist * 100, 8)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-blue-600 dark:text-blue-400">
                        {fmtPrice(s.price)}원 ({distPercent(s.price)})
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-1">근접 지지선 없음</p>
          )}
        </div>
      </div>

      {/* 최근 고점/저점 정보 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="bg-red-50 dark:bg-red-900/10 rounded-md px-3 py-2 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">최근 {recentDays}일 최고가</p>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{fmtPrice(recentLevels.highestHigh)}원</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{recentLevels.highestDate}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-md px-3 py-2 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">최근 {recentDays}일 최저가</p>
          <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">{fmtPrice(recentLevels.lowestLow)}원</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{recentLevels.lowestDate}</p>
        </div>
      </div>

      {/* 상세 보기 토글 */}
      <button
        onClick={() => setShowDetail(v => !v)}
        className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
      >
        {showDetail ? '간략히 보기 ▲' : '전체 레벨 보기 ▼'}
      </button>

      {showDetail && (
        <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 전체 저항선 */}
            <div>
              <p className="text-xs font-medium text-red-500 mb-1">저항선 전체</p>
              <div className="space-y-1">
                {resistances.map((r, idx) => (
                  <div key={`rd-${idx}`} className="flex justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">{r.label}</span>
                    <span className="text-red-500 font-medium">{fmtPrice(r.price)}원 <span className="text-gray-400">({distPercent(r.price)})</span></span>
                  </div>
                ))}
                {resistances.length === 0 && <p className="text-xs text-gray-400">없음</p>}
              </div>
            </div>

            {/* 전체 지지선 */}
            <div>
              <p className="text-xs font-medium text-blue-500 mb-1">지지선 전체</p>
              <div className="space-y-1">
                {supports.map((s, idx) => (
                  <div key={`sd-${idx}`} className="flex justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">{s.label}</span>
                    <span className="text-blue-500 font-medium">{fmtPrice(s.price)}원 <span className="text-gray-400">({distPercent(s.price)})</span></span>
                  </div>
                ))}
                {supports.length === 0 && <p className="text-xs text-gray-400">없음</p>}
              </div>
            </div>
          </div>

          {/* 읽는 법 */}
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-md p-3 space-y-1">
            <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">지지선/저항선 읽는 법</p>
            <p><span className="text-red-500 font-medium">저항선</span> = 가격 상승 시 매도 압력이 강해지는 가격대. 돌파 시 추가 상승 기대</p>
            <p><span className="text-blue-500 font-medium">지지선</span> = 가격 하락 시 매수세가 유입되는 가격대. 이탈 시 추가 하락 우려</p>
            <p><span className="text-purple-500 font-medium">피봇 포인트</span> = 전일 고가/저가/종가 기반 당일 핵심 가격대 (단기 트레이딩 참고)</p>
            <p><span className="text-green-600 dark:text-green-400 font-medium">이동평균선</span> = 일정 기간 평균가로, 추세의 방향과 지지/저항 역할을 동시 수행</p>
          </div>
        </div>
      )}

    </div>
  )
}

SupportResistanceSection.propTypes = {
  data: PropTypes.shape({
    currentPrice: PropTypes.number,
    pivot: PropTypes.object,
    movingAverages: PropTypes.array,
    recentLevels: PropTypes.object,
    recentDays: PropTypes.number,
    supports: PropTypes.array,
    resistances: PropTypes.array,
  }),
}

/**
 * ETFCharts 컴포넌트
 * ETF 상세 페이지의 차트 섹션 (가격 차트, 매매 동향 차트, RSI, MACD)
 */
export default function ETFCharts({
  pricesData,
  tradingFlowData,
  ticker,
  dateRange,
  showVolume,
  showTradingFlow,
  pricesLoading,
  pricesFetching,
  tradingFlowLoading,
  tradingFlowFetching,
  pricesError,
  tradingFlowError,
  refetchPrices,
  refetchTradingFlow,
  priceChartScrollRef,
  tradingFlowChartScrollRef,
  onPriceChartScroll,
  onTradingFlowChartScroll,
  purchasePrice,
  rsiData,
  macdData,
  showRSI,
  showMACD,
  onToggleRSI,
  onToggleMACD,
  supportResistanceData,
  showTechnicalSection = true,
}) {
  return (
    <div className="space-y-4 mb-4">
      {/* 가격 차트 (거래량 포함) */}
      {showVolume && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 transition-all duration-300 ease-in-out hover:shadow-xl relative">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">가격 차트</h3>
          {pricesFetching && !pricesLoading && (
            <span className="absolute top-4 right-4 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              갱신 중
            </span>
          )}
          {pricesLoading ? (
            // 최초 로딩(데이터 없음)에만 스켈레톤. 백그라운드 재조회(pricesFetching) 중에는
            // 기존 차트를 계속 보여준다(재조회 때마다 스켈레톤으로 깜빡이며 느려 보이는 문제 방지).
            <LoadingIndicator
              isLoading={true}
              message="가격 데이터를 불러오는 중..."
              subMessage="데이터 수집 시 최대 30초가 소요될 수 있습니다."
            />
          ) : pricesError ? (
            <ErrorFallback error={pricesError} onRetry={refetchPrices} />
          ) : (
            <PriceChart
              data={pricesData}
              ticker={ticker}
              dateRange={dateRange}
              scrollRef={priceChartScrollRef}
              onScroll={onPriceChartScroll}
              purchasePrice={purchasePrice}
            />
          )}
        </div>
      )}

      {/* 매매 동향 차트 (고급 분석 모드에서만 표시) */}
      {showTradingFlow && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 transition-all duration-300 ease-in-out hover:shadow-xl relative">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">투자자별 매매 동향</h3>
          {tradingFlowLoading || tradingFlowFetching ? (
            <LoadingIndicator
              isLoading={true}
              message="매매 동향 데이터를 불러오는 중..."
              subMessage={tradingFlowFetching && !tradingFlowLoading ? "데이터를 수집하고 있습니다. 최대 30초가 소요될 수 있습니다." : ""}
            />
          ) : tradingFlowError ? (
            <ErrorFallback error={tradingFlowError} onRetry={refetchTradingFlow} />
          ) : (
            <TradingFlowChart
              data={tradingFlowData}
              ticker={ticker}
              dateRange={dateRange}
              scrollRef={tradingFlowChartScrollRef}
              onScroll={onTradingFlowChartScroll}
            />
          )}
        </div>
      )}

      {/* 기술지표 + 지지선/저항선 (고급 분석 모드에서만 표시) */}
      {showTechnicalSection && (
        <>
          <TechnicalIndicatorsSection
            rsiData={rsiData}
            macdData={macdData}
            showRSI={showRSI}
            showMACD={showMACD}
            onToggleRSI={onToggleRSI}
            onToggleMACD={onToggleMACD}
          />

          <SupportResistanceSection data={supportResistanceData} />
        </>
      )}
    </div>
  )
}

ETFCharts.propTypes = {
  pricesData: PropTypes.array,
  tradingFlowData: PropTypes.array,
  ticker: PropTypes.string.isRequired,
  dateRange: PropTypes.string.isRequired,
  showVolume: PropTypes.bool,
  showTradingFlow: PropTypes.bool,
  pricesLoading: PropTypes.bool,
  pricesFetching: PropTypes.bool,
  tradingFlowLoading: PropTypes.bool,
  tradingFlowFetching: PropTypes.bool,
  pricesError: PropTypes.object,
  tradingFlowError: PropTypes.object,
  refetchPrices: PropTypes.func,
  refetchTradingFlow: PropTypes.func,
  priceChartScrollRef: PropTypes.object,
  tradingFlowChartScrollRef: PropTypes.object,
  onPriceChartScroll: PropTypes.func,
  onTradingFlowChartScroll: PropTypes.func,
  purchasePrice: PropTypes.number,
  rsiData: PropTypes.array,
  macdData: PropTypes.array,
  showRSI: PropTypes.bool,
  showMACD: PropTypes.bool,
  onToggleRSI: PropTypes.func,
  onToggleMACD: PropTypes.func,
  supportResistanceData: PropTypes.object,
  showTechnicalSection: PropTypes.bool,
}
