import { useState, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { alertApi } from '../../services/api'
import { formatPrice } from '../../utils/format'

/* ── 유틸 ── */
const toCommaString = (value) => {
  if (value === '' || value === null || value === undefined) return ''
  const num = String(value).replace(/[^0-9]/g, '')
  if (num === '') return ''
  return Number(num).toLocaleString('ko-KR')
}
const fromCommaString = (str) => {
  if (!str) return NaN
  return Number(String(str).replace(/,/g, ''))
}

/* ── 알림 유형별 초기값 ── */
const FORM_DEFAULTS = {
  buy:             { alert_type: 'buy',             direction: 'below', target_price: '', memo: '' },
  sell:            { alert_type: 'sell',            direction: 'above', target_price: '', memo: '' },
  price_change:    { alert_type: 'price_change',    direction: 'both',  target_price: '', memo: '' },
  trading_signal:  { alert_type: 'trading_signal',  direction: 'both',  target_price: '0', memo: '' },
}

/* ── 탭 정의 ── */
const TABS = [
  { key: 'target',  label: '목표가' },
  { key: 'change',  label: '급등/급락' },
  { key: 'signal',  label: '매매시그널' },
]

/**
 * 알림 설정 패널 (3-in-1)
 * - 목표가 도달: 매수/매도
 * - 급등/급락: 등락률 ±N%
 * - 매매 시그널: 외국인·기관 동시 매수/매도
 */
const PriceTargetPanel = ({ ticker, currentPrice }) => {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('target')
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(FORM_DEFAULTS.buy)

  /* ── 데이터 조회 ── */
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['alertRules', ticker],
    queryFn: async () => { const res = await alertApi.getRules(ticker, false); return res.data },
    enabled: !!ticker,
    staleTime: 30_000,
  })

  /* ── 뮤테이션 ── */
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['alertRules', ticker] })

  const createMutation = useMutation({
    mutationFn: (data) => alertApi.createRule(data),
    onSuccess: () => { invalidate(); resetForm() },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => alertApi.updateRule(id, data),
    onSuccess: () => { invalidate(); setEditingId(null); resetForm() },
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => alertApi.deleteRule(id),
    onSuccess: invalidate,
  })
  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => alertApi.updateRule(id, { is_active }),
    onSuccess: invalidate,
  })

  /* ── 헬퍼 ── */
  const resetForm = useCallback(() => {
    setForm({ ...FORM_DEFAULTS.buy, _pctInput: '' })
    setIsAdding(false)
    setEditingId(null)
  }, [])

  const calcDiffPct = (targetPrice) => {
    if (!currentPrice || !targetPrice) return null
    return ((targetPrice - currentPrice) / currentPrice * 100).toFixed(1)
  }

  /* ── Submit ── */
  const handleSubmit = (e) => {
    e.preventDefault()
    let price
    if (form.alert_type === 'trading_signal') {
      price = 0
    } else if (form.alert_type === 'price_change') {
      price = parseFloat(form.target_price)
    } else {
      price = fromCommaString(form.target_price)
    }
    if (form.alert_type !== 'trading_signal' && (isNaN(price) || price <= 0)) return

    const payload = {
      ticker,
      alert_type: form.alert_type,
      direction: form.direction,
      target_price: price,
      memo: form.memo || null,
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const startEdit = (rule) => {
    const isPriceChange = rule.alert_type === 'price_change'
    const isSignal = rule.alert_type === 'trading_signal'
    const isTarget = rule.alert_type === 'buy' || rule.alert_type === 'sell'
    // 목표가 편집 시 % 역산
    const pctVal = isTarget && currentPrice ? ((rule.target_price - currentPrice) / currentPrice * 100).toFixed(1) : ''
    setForm({
      alert_type: rule.alert_type,
      direction: rule.direction,
      target_price: isSignal ? '0' : isPriceChange ? String(rule.target_price) : toCommaString(rule.target_price),
      memo: rule.memo || '',
      _pctInput: pctVal,
    })
    setEditingId(rule.id)
    setIsAdding(true)
    // 탭도 맞춤
    if (isPriceChange) setActiveTab('change')
    else if (isSignal) setActiveTab('signal')
    else setActiveTab('target')
  }

  const handleDelete = (id) => {
    if (window.confirm('이 알림 규칙을 삭제하시겠습니까?')) {
      deleteMutation.mutate(id)
    }
  }

  const openAddForm = (tab) => {
    if (tab === 'target') setForm({ ...FORM_DEFAULTS.buy, _pctInput: '' })
    else if (tab === 'change') setForm(FORM_DEFAULTS.price_change)
    else setForm(FORM_DEFAULTS.trading_signal)
    setEditingId(null)
    setIsAdding(true)
  }

  /* ── 탭별 규칙 필터 ── */
  const filteredRules = useMemo(() => {
    if (activeTab === 'target') return rules.filter(r => r.alert_type === 'buy' || r.alert_type === 'sell')
    if (activeTab === 'change') return rules.filter(r => r.alert_type === 'price_change')
    return rules.filter(r => r.alert_type === 'trading_signal')
  }, [rules, activeTab])

  const buyRules = filteredRules.filter(r => r.alert_type === 'buy')
  const sellRules = filteredRules.filter(r => r.alert_type === 'sell')

  /* ── 렌더 ── */
  return (
    <div className="mt-4">
      {/* 헤더 + 탭 */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          알림 설정
        </h4>
        {!isAdding && (
          <button
            onClick={() => openAddForm(activeTab)}
            className="text-xs px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium"
          >
            + 추가
          </button>
        )}
      </div>

      {/* 탭 바 */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-3">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); if (isAdding) resetForm() }}
            className={`flex-1 py-1.5 text-xs font-medium text-center transition-colors border-b-2 ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
            {rules.filter(r => {
              if (tab.key === 'target') return r.alert_type === 'buy' || r.alert_type === 'sell'
              if (tab.key === 'change') return r.alert_type === 'price_change'
              return r.alert_type === 'trading_signal'
            }).filter(r => r.is_active).length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                {rules.filter(r => {
                  if (tab.key === 'target') return r.alert_type === 'buy' || r.alert_type === 'sell'
                  if (tab.key === 'change') return r.alert_type === 'price_change'
                  return r.alert_type === 'trading_signal'
                }).filter(r => r.is_active).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 입력 폼 */}
      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2.5">
          {/* ── 목표가 폼 ── */}
          {activeTab === 'target' && (
            <>
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm(prev => ({ ...prev, alert_type: 'buy', direction: 'below' }))}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${form.alert_type === 'buy' ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                  매수 목표
                </button>
                <button type="button" onClick={() => setForm(prev => ({ ...prev, alert_type: 'sell', direction: 'above' }))}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${form.alert_type === 'sell' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                  매도 목표
                </button>
              </div>

              {/* ±% 입력 → 목표가 자동 계산 */}
              {currentPrice && (
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">현재가 기준 % 설정</label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative w-24 flex-shrink-0">
                      <input
                        type="number"
                        value={form._pctInput ?? ''}
                        onChange={(e) => {
                          const val = e.target.value
                          const pct = parseFloat(val)
                          const newForm = { ...form, _pctInput: val }
                          if (!isNaN(pct) && currentPrice) {
                            const computed = Math.round(currentPrice * (1 + pct / 100))
                            if (computed > 0) {
                              newForm.target_price = toCommaString(computed)
                              newForm.direction = pct < 0 ? 'below' : 'above'
                            }
                          }
                          setForm(newForm)
                        }}
                        placeholder="예: -3"
                        step="0.1"
                        className="w-full px-2 py-1.5 pr-7 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                    </div>
                    {/* 퀵 버튼 */}
                    {[-10, -5, -3, -1, 1, 3, 5, 10].map(pct => {
                      const computed = Math.round(currentPrice * (1 + pct / 100))
                      return (
                        <button key={pct} type="button"
                          onClick={() => setForm(prev => ({
                            ...prev,
                            _pctInput: String(pct),
                            target_price: toCommaString(computed),
                            direction: pct < 0 ? 'below' : 'above',
                          }))}
                          className={`px-1.5 py-1.5 text-[11px] font-medium rounded flex-shrink-0 transition-colors ${
                            pct < 0
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                              : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40'
                          }`}>
                          {pct > 0 ? '+' : ''}{pct}%
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">목표가 / 조건</label>
                  {currentPrice && <span className="text-xs text-gray-400 dark:text-gray-500">(현재가: {formatPrice(currentPrice)})</span>}
                </div>
                <div className="flex gap-2">
                  <input type="text" inputMode="numeric" value={form.target_price}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '')
                      const price = raw ? Number(raw) : null
                      const pct = price && currentPrice ? ((price - currentPrice) / currentPrice * 100).toFixed(1) : ''
                      setForm(prev => ({ ...prev, target_price: raw ? toCommaString(raw) : '', _pctInput: pct }))
                    }}
                    placeholder="목표 가격" className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                  <select value={form.direction} onChange={(e) => setForm(prev => ({ ...prev, direction: e.target.value }))}
                    className="w-[130px] flex-shrink-0 px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <option value="below">이하 하락 시</option>
                    <option value="above">이상 상승 시</option>
                  </select>
                </div>
                {form.target_price && currentPrice && (
                  <p className="text-xs mt-1 text-gray-400">
                    현재가 대비{' '}
                    <span className={parseFloat(calcDiffPct(fromCommaString(form.target_price))) >= 0 ? 'text-red-500' : 'text-blue-500'}>
                      {calcDiffPct(fromCommaString(form.target_price)) > 0 ? '+' : ''}{calcDiffPct(fromCommaString(form.target_price))}%
                    </span>
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── 급등/급락 폼 ── */}
          {activeTab === 'change' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">등락률 임계값 / 방향</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input type="number" value={form.target_price}
                      onChange={(e) => setForm(prev => ({ ...prev, target_price: e.target.value }))}
                      placeholder="예: 3" min="0.1" max="100" step="0.1"
                      className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                  </div>
                  <select value={form.direction} onChange={(e) => setForm(prev => ({ ...prev, direction: e.target.value }))}
                    className="w-[130px] flex-shrink-0 px-2 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <option value="both">급등+급락 모두</option>
                    <option value="above">급등만</option>
                    <option value="below">급락만</option>
                  </select>
                </div>
                <p className="text-xs mt-1 text-gray-400">장중 등락률이 설정한 % 이상 변동하면 알림</p>
              </div>
            </>
          )}

          {/* ── 매매시그널 폼 ── */}
          {activeTab === 'signal' && (
            <>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">시그널 유형</label>
                <select value={form.direction} onChange={(e) => setForm(prev => ({ ...prev, direction: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                  <option value="both">동시 매수 + 동시 매도 모두</option>
                  <option value="above">외국인·기관 동시 매수만</option>
                  <option value="below">외국인·기관 동시 매도만</option>
                </select>
                <p className="text-xs mt-1 text-gray-400">외국인과 기관이 같은 방향으로 매매할 때 알림</p>
              </div>
            </>
          )}

          {/* 메모 (공통) */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">메모 (선택)</label>
            <input type="text" value={form.memo}
              onChange={(e) => setForm(prev => ({ ...prev, memo: e.target.value }))}
              placeholder={activeTab === 'target' ? '예: 분할 매수 1차' : activeTab === 'change' ? '예: 급락 시 추가 매수 검토' : '예: 기관 수급 확인'}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" maxLength={100} />
          </div>

          {/* 버튼 */}
          <div className="flex gap-2">
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {editingId ? '수정' : '저장'}
            </button>
            <button type="button" onClick={resetForm}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
              취소
            </button>
          </div>
        </form>
      )}

      {/* ── 규칙 목록 ── */}
      {isLoading ? (
        <div className="text-xs text-gray-400 text-center py-2">불러오는 중...</div>
      ) : filteredRules.length === 0 && !isAdding ? (
        <div className="text-center py-4 text-xs text-gray-400 dark:text-gray-500">
          <p>{activeTab === 'target' ? '설정된 목표가가 없습니다.' : activeTab === 'change' ? '설정된 급등/급락 알림이 없습니다.' : '설정된 매매 시그널이 없습니다.'}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* 목표가 탭: 매수/매도 그룹 */}
          {activeTab === 'target' && (
            <>
              {buyRules.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-red-500 dark:text-red-400 mb-1">매수 목표</p>
                  {buyRules.map(rule => (
                    <RuleItem key={rule.id} rule={rule} currentPrice={currentPrice} calcDiffPct={calcDiffPct}
                      onEdit={startEdit} onDelete={handleDelete} onToggle={(id, active) => toggleMutation.mutate({ id, is_active: active })} />
                  ))}
                </div>
              )}
              {sellRules.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-blue-500 dark:text-blue-400 mb-1">매도 목표</p>
                  {sellRules.map(rule => (
                    <RuleItem key={rule.id} rule={rule} currentPrice={currentPrice} calcDiffPct={calcDiffPct}
                      onEdit={startEdit} onDelete={handleDelete} onToggle={(id, active) => toggleMutation.mutate({ id, is_active: active })} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* 급등/급락 탭 */}
          {activeTab === 'change' && filteredRules.map(rule => (
            <RuleItem key={rule.id} rule={rule} currentPrice={currentPrice} calcDiffPct={calcDiffPct}
              onEdit={startEdit} onDelete={handleDelete} onToggle={(id, active) => toggleMutation.mutate({ id, is_active: active })} />
          ))}

          {/* 매매시그널 탭 */}
          {activeTab === 'signal' && filteredRules.map(rule => (
            <RuleItem key={rule.id} rule={rule} currentPrice={currentPrice} calcDiffPct={calcDiffPct}
              onEdit={startEdit} onDelete={handleDelete} onToggle={(id, active) => toggleMutation.mutate({ id, is_active: active })} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════ */
/* 개별 규칙 아이템                                */
/* ══════════════════════════════════════════════ */
const RuleItem = ({ rule, currentPrice, calcDiffPct, onEdit, onDelete, onToggle }) => {
  const isBuy = rule.alert_type === 'buy'
  const isSell = rule.alert_type === 'sell'
  const isPriceChange = rule.alert_type === 'price_change'
  const isSignal = rule.alert_type === 'trading_signal'
  const isInactive = !rule.is_active

  // 색상
  const colorClass = isBuy || isPriceChange
    ? 'border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10'
    : isSell
      ? 'border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10'
      : 'border-purple-200 dark:border-purple-900/40 bg-purple-50/50 dark:bg-purple-900/10'

  const dotColor = isBuy ? 'border-red-400 bg-red-400'
    : isSell ? 'border-blue-400 bg-blue-400'
    : isPriceChange ? 'border-orange-400 bg-orange-400'
    : 'border-purple-400 bg-purple-400'

  // 라벨
  const renderLabel = () => {
    if (isBuy || isSell) {
      const diffPct = calcDiffPct(rule.target_price)
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-bold ${isBuy ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
            {formatPrice(rule.target_price)}
          </span>
          {diffPct && (
            <span className={`${parseFloat(diffPct) >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
              ({diffPct > 0 ? '+' : ''}{diffPct}%)
            </span>
          )}
          <span className="text-gray-400">{rule.direction === 'above' ? '이상' : '이하'}</span>
        </div>
      )
    }
    if (isPriceChange) {
      const dirLabel = rule.direction === 'both' ? '급등+급락' : rule.direction === 'above' ? '급등' : '급락'
      return (
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-orange-600 dark:text-orange-400">±{rule.target_price}%</span>
          <span className="text-gray-400">{dirLabel} 감지</span>
        </div>
      )
    }
    // trading_signal
    const dirLabel = rule.direction === 'both' ? '동시 매수/매도' : rule.direction === 'above' ? '동시 매수' : '동시 매도'
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-purple-600 dark:text-purple-400">외국인+기관</span>
        <span className="text-gray-400">{dirLabel}</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-between p-2 rounded-md border text-xs transition-colors mb-1 ${isInactive ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 opacity-50' : colorClass}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button onClick={() => onToggle(rule.id, rule.is_active ? 0 : 1)}
          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${rule.is_active ? dotColor : 'border-gray-300 dark:border-gray-600'}`}
          title={rule.is_active ? '비활성화' : '활성화'}>
          {!!rule.is_active && (
            <svg className="w-full h-full text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        <div className="min-w-0">
          {renderLabel()}
          {rule.memo && <p className="text-gray-500 dark:text-gray-400 truncate mt-0.5">{rule.memo}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        <button onClick={() => onEdit(rule)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" title="수정">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button onClick={() => onDelete(rule.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="삭제">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}

RuleItem.propTypes = {
  rule: PropTypes.object.isRequired,
  currentPrice: PropTypes.number,
  calcDiffPct: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onToggle: PropTypes.func.isRequired,
}

PriceTargetPanel.propTypes = {
  ticker: PropTypes.string.isRequired,
  currentPrice: PropTypes.number,
}

export default PriceTargetPanel
