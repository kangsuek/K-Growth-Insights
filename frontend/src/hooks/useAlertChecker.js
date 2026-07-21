import { useRef, useEffect, useCallback } from 'react'
import { useToast } from '../contexts/ToastContext'
import { useAlertStore } from '../contexts/AlertContext'
import { alertApi } from '../services/api'
import { formatPrice } from '../utils/format'

/**
 * 3종 알림 감지 훅
 *
 * - 목표가 도달: 분봉 현재가가 매수/매도 목표가를 돌파
 * - 급등/급락: 장중 등락률이 사용자 설정 임계 % 초과
 * - 매매 시그널: 외국인+기관 동시 순매수 또는 동시 순매도
 *
 * @param {string} ticker - 종목 코드
 * @param {string} tickerName - 종목명 (알림 메시지용)
 * @param {Array} alertRules - alert_rules 배열
 * @param {Object} intradayData - 분봉 데이터 ({ data: [...], ... })
 * @param {number|null} previousClose - 전일 종가
 * @param {Array} tradingFlowData - 매매동향 데이터 배열
 */
export default function useAlertChecker({
  ticker,
  tickerName = '',
  alertRules = [],
  intradayData = null,
  previousClose = null,
  tradingFlowData = [],
}) {
  const toast = useToast()
  const alertStore = useAlertStore()

  // 세션 동안 이미 발생한 알림을 추적 (rule.id → true)
  const firedRef = useRef(new Set())

  // 마지막으로 체크한 매매동향 날짜 (중복 방지)
  const lastTradingFlowDateRef = useRef(null)

  const name = tickerName || ticker

  // ── 알림 발생 헬퍼 ──
  const fireAlert = useCallback(
    (rule, message, toastType = 'warning') => {
      const key = `${rule.id}-${rule.alert_type}`
      if (firedRef.current.has(key)) return // 이미 발생
      firedRef.current.add(key)

      // 토스트 표시 (5초)
      toast[toastType](message, 5000)

      // 전역 알림 저장소에 push (Header 벨 표시용)
      alertStore.pushAlert({
        ticker,
        tickerName: name,
        alert_type: rule.alert_type,
        message,
      })

      // 백엔드에 기록 (fire-and-forget)
      alertApi.recordTrigger({
        rule_id: rule.id,
        ticker,
        alert_type: rule.alert_type,
        message,
      }).catch(() => {})
    },
    [ticker, name, toast, alertStore],
  )

  // ── 1. 목표가 도달 체크 ──
  useEffect(() => {
    if (!intradayData?.data?.length) return
    const currentPrice = intradayData.data[intradayData.data.length - 1]?.price
    if (!currentPrice) return

    const targetRules = alertRules.filter(
      (r) => (r.alert_type === 'buy' || r.alert_type === 'sell') && r.is_active,
    )

    for (const rule of targetRules) {
      const isBuy = rule.alert_type === 'buy'
      const target = rule.target_price

      // buy + below: 현재가 ≤ 목표가이면 알림
      // buy + above: 현재가 ≥ 목표가이면 알림
      // sell + above: 현재가 ≥ 목표가이면 알림
      // sell + below: 현재가 ≤ 목표가이면 알림
      const hit =
        rule.direction === 'below'
          ? currentPrice <= target
          : currentPrice >= target

      if (hit) {
        const label = isBuy ? '매수' : '매도'
        const memo = rule.memo ? ` (${rule.memo})` : ''
        fireAlert(
          rule,
          `[${name}] ${label} 목표가 ${formatPrice(target)} 도달! 현재가 ${formatPrice(currentPrice)}${memo}`,
          isBuy ? 'info' : 'success',
        )
      }
    }
  }, [intradayData, alertRules, name, fireAlert])

  // ── 2. 급등/급락 체크 ──
  useEffect(() => {
    if (!intradayData?.data?.length || !previousClose) return
    const currentPrice = intradayData.data[intradayData.data.length - 1]?.price
    if (!currentPrice) return

    const changePct = ((currentPrice - previousClose) / previousClose) * 100

    const changeRules = alertRules.filter(
      (r) => r.alert_type === 'price_change' && r.is_active,
    )

    for (const rule of changeRules) {
      const threshold = rule.target_price // 임계 %

      let hit = false
      if (rule.direction === 'above' && changePct >= threshold) hit = true
      if (rule.direction === 'below' && changePct <= -threshold) hit = true
      if (rule.direction === 'both' && Math.abs(changePct) >= threshold) hit = true

      if (hit) {
        const arrow = changePct >= 0 ? '급등' : '급락'
        fireAlert(
          rule,
          `[${name}] ${arrow} 감지! 등락률 ${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% (임계값 ±${threshold}%)`,
          changePct >= 0 ? 'warning' : 'error',
        )
      }
    }
  }, [intradayData, previousClose, alertRules, name, fireAlert])

  // ── 3. 매매 시그널 체크 ──
  useEffect(() => {
    if (!tradingFlowData?.length) return

    const signalRules = alertRules.filter(
      (r) => r.alert_type === 'trading_signal' && r.is_active,
    )
    if (signalRules.length === 0) return

    // 최신 매매동향 (오늘 또는 가장 최근)
    const latest = tradingFlowData[0]
    if (!latest) return

    // 같은 날짜에 대해 중복 체크 방지
    const dateKey = latest.date
    if (lastTradingFlowDateRef.current === dateKey) return
    lastTradingFlowDateRef.current = dateKey

    const foreignNet = latest.foreign_net || 0
    const institutionalNet = latest.institutional_net || 0

    const bothBuying = foreignNet > 0 && institutionalNet > 0
    const bothSelling = foreignNet < 0 && institutionalNet < 0

    for (const rule of signalRules) {
      let hit = false
      let signalText = ''

      if (rule.direction === 'both') {
        if (bothBuying) {
          hit = true
          signalText = '외국인+기관 동시 순매수'
        } else if (bothSelling) {
          hit = true
          signalText = '외국인+기관 동시 순매도'
        }
      } else if (rule.direction === 'above' && bothBuying) {
        hit = true
        signalText = '외국인+기관 동시 순매수'
      } else if (rule.direction === 'below' && bothSelling) {
        hit = true
        signalText = '외국인+기관 동시 순매도'
      }

      if (hit) {
        const fmtVal = (v) => {
          const abs = Math.abs(v)
          if (abs >= 100000000) return `${(v / 100000000).toFixed(1)}억`
          if (abs >= 10000) return `${(v / 10000).toFixed(0)}만`
          return v.toLocaleString()
        }
        fireAlert(
          rule,
          `[${name}] 매매 시그널: ${signalText} (외국인 ${fmtVal(foreignNet)}, 기관 ${fmtVal(institutionalNet)})`,
          bothBuying ? 'success' : 'error',
        )
      }
    }
  }, [tradingFlowData, alertRules, name, fireAlert])

  // 알림 초기화 (종목 변경 시)
  useEffect(() => {
    firedRef.current = new Set()
    lastTradingFlowDateRef.current = null
  }, [ticker])
}
