import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../components/common/PageHeader'
import { alertApi, settingsApi } from '../services/api'
import { useToast } from '../contexts/ToastContext'

const RULE_TYPE_LABELS = {
  price_above: '목표가 이상',
  price_below: '목표가 이하',
  rsi_zone: 'RSI 과매수/과매도 진입',
  macd_cross: 'MACD 골든/데드크로스',
}

const STATUS_LABELS = {
  active: { text: '감시 중', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  triggered: { text: '알림 완료', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  disabled: { text: '비활성', className: 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500' },
}

// basis별로 실시간(미확정)/확정 종가 기준을 화면에 명확히 구분해 보여준다.
// (CLAUDE.md '실시간 vs 확정 데이터 기준' 참고 — 알림은 이 구분이 특히 중요하다.)
const BASIS_LABELS = {
  intraday_live: { text: '🔴 실시간(분봉, 미확정)', className: 'text-red-600 dark:text-red-400' },
  daily_live: { text: '🔴 실시간(장중 종가, 미확정)', className: 'text-red-600 dark:text-red-400' },
  daily_confirmed: { text: '✅ 확정 종가 기준', className: 'text-green-600 dark:text-green-400' },
}

function formatDateTime(value) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

export default function Alerts() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [ticker, setTicker] = useState('')
  const [ruleType, setRuleType] = useState('price_above')
  const [targetPrice, setTargetPrice] = useState('')

  const { data: stocks = [] } = useQuery({
    queryKey: ['settings-stocks'],
    queryFn: async () => (await settingsApi.getStocks()).data,
  })

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: async () => (await alertApi.getRules()).data,
  })

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['alert-events'],
    queryFn: async () => (await alertApi.getEvents()).data,
    refetchInterval: 60000,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['alert-rules'] })
    queryClient.invalidateQueries({ queryKey: ['alert-events'] })
    queryClient.invalidateQueries({ queryKey: ['alerts-unread-count'] })
  }

  const createMutation = useMutation({
    mutationFn: (data) => alertApi.createRule(data),
    onSuccess: () => {
      invalidateAll()
      setTargetPrice('')
      toast.success('알림 규칙이 추가되었습니다.', 2000)
    },
    onError: (error) => toast.error(`규칙 추가 실패: ${error.message}`, 3000),
  })

  const updateMutation = useMutation({
    mutationFn: ({ ruleId, data }) => alertApi.updateRule(ruleId, data),
    onSuccess: () => {
      invalidateAll()
      toast.success('규칙이 변경되었습니다.', 2000)
    },
    onError: (error) => toast.error(`규칙 변경 실패: ${error.message}`, 3000),
  })

  const deleteMutation = useMutation({
    mutationFn: (ruleId) => alertApi.deleteRule(ruleId),
    onSuccess: () => {
      invalidateAll()
      toast.success('규칙이 삭제되었습니다.', 2000)
    },
    onError: (error) => toast.error(`규칙 삭제 실패: ${error.message}`, 3000),
  })

  const markReadMutation = useMutation({
    mutationFn: (eventIds) => alertApi.markEventsRead(eventIds),
    onSuccess: invalidateAll,
  })

  const isPriceRule = ruleType === 'price_above' || ruleType === 'price_below'

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!ticker) return
    if (isPriceRule && !targetPrice) return
    createMutation.mutate({
      ticker,
      rule_type: ruleType,
      target_price: isPriceRule ? Number(targetPrice) : null,
    })
  }

  const unreadEventIds = events.filter((ev) => !ev.read_at).map((ev) => ev.id)

  return (
    <div className="animate-fadeIn space-y-6">
      <PageHeader
        title="알림"
        subtitle="추적 종목의 목표가·RSI·MACD 신호를 감시합니다(관찰/투자 등록 종목만 대상)"
      />

      {/* 규칙 생성 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">알림 규칙 추가</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">종목</label>
              <select
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
                required
              >
                <option value="">선택하세요</option>
                {stocks.map((s) => (
                  <option key={s.ticker} value={s.ticker}>{s.name} ({s.ticker})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">유형</label>
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm"
              >
                {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                목표가(원){!isPriceRule && ' — 해당 없음'}
              </label>
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                disabled={!isPriceRule}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm disabled:opacity-50"
                required={isPriceRule}
              />
            </div>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {createMutation.isPending ? '추가 중...' : '규칙 추가'}
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
            목표가 알림은 분봉(1분 주기) 기준, RSI/MACD 신호는 일별 시세(10분 주기) 기준으로 판정합니다.
          </p>
        </form>
      </div>

      {/* 규칙 목록 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">등록된 규칙</h2>
        </div>
        <div className="px-4 sm:px-6 py-4">
          {rulesLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">불러오는 중...</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">등록된 알림 규칙이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-4">종목</th>
                    <th className="py-2 pr-4">유형</th>
                    <th className="py-2 pr-4">조건</th>
                    <th className="py-2 pr-4">상태</th>
                    <th className="py-2 pr-4">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => {
                    const status = STATUS_LABELS[rule.status] || STATUS_LABELS.active
                    return (
                      <tr key={rule.id} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">{rule.ticker}</td>
                        <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{RULE_TYPE_LABELS[rule.rule_type]}</td>
                        <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                          {rule.target_price != null ? `${Number(rule.target_price).toLocaleString('ko-KR')}원` : '-'}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>{status.text}</span>
                        </td>
                        <td className="py-2 pr-4 space-x-2">
                          {rule.status !== 'active' && (
                            <button
                              onClick={() => updateMutation.mutate({ ruleId: rule.id, data: { status: 'active' } })}
                              className="text-primary-600 dark:text-primary-400 hover:underline"
                            >
                              재활성화
                            </button>
                          )}
                          <button
                            onClick={() => deleteMutation.mutate(rule.id)}
                            className="text-red-600 dark:text-red-400 hover:underline"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 발생 이력 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">발생 이력</h2>
          {unreadEventIds.length > 0 && (
            <button
              onClick={() => markReadMutation.mutate(unreadEventIds)}
              className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              모두 읽음 처리
            </button>
          )}
        </div>
        <div className="px-4 sm:px-6 py-4 space-y-3">
          {eventsLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">불러오는 중...</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">발생한 알림이 없습니다.</p>
          ) : (
            events.map((ev) => {
              const basis = BASIS_LABELS[ev.basis]
              return (
                <div
                  key={ev.id}
                  className={`p-3 rounded-lg border ${ev.read_at ? 'border-gray-200 dark:border-gray-700' : 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{ev.message}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(ev.triggered_at)}</p>
                    </div>
                    {basis && (
                      <span className={`shrink-0 text-xs font-medium ${basis.className}`}>{basis.text}</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
