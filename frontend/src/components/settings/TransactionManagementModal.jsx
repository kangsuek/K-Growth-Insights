import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../../services/api'
import { useToast } from '../../contexts/ToastContext'
import { formatPrice, formatNumber, getPriceChangeColor } from '../../utils/format'

const TYPE_LABELS = { BUY: '매수', SELL: '매도' }

const EMPTY_DRAFT = {
  transaction_type: 'BUY',
  transaction_date: '',
  price: '',
  quantity: '',
  note: '',
}

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

/**
 * 종목별 매수/매도 거래내역 관리 모달.
 *
 * 평단가(가중평균)·보유수량·실현손익은 백엔드(services/transactions.py)가 거래내역으로부터
 * 계산해 stocks 테이블에 반영한다 — 여기서는 거래 CRUD만 하고, 계산된 값은 캐시
 * 무효화 후 다시 읽어온다.
 */
export default function TransactionManagementModal({ stock, onClose }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [formError, setFormError] = useState(null)

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['stock-transactions', stock.ticker],
    queryFn: async () => (await settingsApi.getTransactions(stock.ticker)).data,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-transactions', stock.ticker] })
    queryClient.invalidateQueries({ queryKey: ['settings-stocks'] })
    queryClient.invalidateQueries({ queryKey: ['etfs'] })
    queryClient.invalidateQueries({ queryKey: ['etf', stock.ticker] })
  }

  const createMutation = useMutation({
    mutationFn: (data) => settingsApi.createTransaction(stock.ticker, data),
    onSuccess: () => {
      invalidateAll()
      setDraft(EMPTY_DRAFT)
      setFormError(null)
      toast.success('거래내역이 추가되었습니다.', 2000)
    },
    onError: (error) => setFormError(error.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => settingsApi.updateTransaction(id, data),
    onSuccess: () => {
      invalidateAll()
      setEditingId(null)
      setEditDraft(null)
      toast.success('거래내역이 수정되었습니다.', 2000)
    },
    onError: (error) => toast.error(`수정 실패: ${error.message}`, 3000),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => settingsApi.deleteTransaction(id),
    onSuccess: () => {
      invalidateAll()
      toast.success('거래내역이 삭제되었습니다.', 2000)
    },
    onError: (error) => toast.error(`삭제 실패: ${error.message}`, 3000),
  })

  const totalRealizedPnl = useMemo(
    () => transactions.reduce((sum, t) => sum + (t.realized_pnl || 0), 0),
    [transactions]
  )

  const handleCreate = (e) => {
    e.preventDefault()
    setFormError(null)
    if (!draft.transaction_date || !draft.price || !draft.quantity) {
      setFormError('날짜·가격·수량을 모두 입력하세요.')
      return
    }
    createMutation.mutate({
      transaction_type: draft.transaction_type,
      transaction_date: draft.transaction_date,
      price: toNumberOrNull(draft.price),
      quantity: toNumberOrNull(draft.quantity),
      note: draft.note || null,
    })
  }

  const startEdit = (t) => {
    setEditingId(t.id)
    setEditDraft({
      transaction_type: t.transaction_type,
      transaction_date: t.transaction_date,
      price: String(t.price),
      quantity: String(t.quantity),
      note: t.note || '',
    })
  }

  const handleEditSave = (id) => {
    const price = toNumberOrNull(editDraft.price)
    const quantity = toNumberOrNull(editDraft.quantity)
    if (!editDraft.transaction_date || price === null || price <= 0 || quantity === null || quantity <= 0) {
      toast.error('날짜·가격·수량을 올바르게 입력하세요.', 3000)
      return
    }
    updateMutation.mutate({
      id,
      data: {
        transaction_type: editDraft.transaction_type,
        transaction_date: editDraft.transaction_date,
        price,
        quantity,
        note: editDraft.note || null,
      },
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto transition-colors">
        {/* 헤더 */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 rounded-t-lg z-10">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              거래내역 — {stock.name} ({stock.ticker})
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              매입가·보유수량은 아래 거래내역으로부터 자동 계산됩니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-4">
          {/* 요약: 현재 평단가/수량 + 누적 실현손익 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">평단가</p>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {stock.purchase_price ? `${formatPrice(stock.purchase_price)}원` : '-'}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">보유수량</p>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {stock.quantity ? `${formatNumber(stock.quantity)}주` : '-'}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">누적 실현손익</p>
              <p className={`text-base font-semibold ${getPriceChangeColor(totalRealizedPnl)}`}>
                {totalRealizedPnl !== 0 ? `${formatPrice(totalRealizedPnl)}원` : '-'}
              </p>
            </div>
          </div>

          {/* 거래 추가 폼 */}
          <form onSubmit={handleCreate} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">유형</label>
                <select
                  value={draft.transaction_type}
                  onChange={(e) => setDraft((d) => ({ ...d, transaction_type: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="BUY">매수</option>
                  <option value="SELL">매도</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">날짜</label>
                <input
                  type="date"
                  aria-label="날짜"
                  value={draft.transaction_date}
                  onChange={(e) => setDraft((d) => ({ ...d, transaction_date: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">가격(원)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  aria-label="가격(원)"
                  value={draft.price}
                  onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                  placeholder="예: 70000"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">수량</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  aria-label="수량"
                  value={draft.quantity}
                  onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
                  placeholder="예: 10"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {createMutation.isPending ? '추가 중...' : '추가'}
              </button>
            </div>
            <div className="mt-2">
              <input
                type="text"
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                placeholder="메모(선택)"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            {formError && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">{formError}</p>
            )}
          </form>

          {/* 거래내역 목록 */}
          {isLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">불러오는 중...</p>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">등록된 거래내역이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-3">날짜</th>
                    <th className="py-2 pr-3">유형</th>
                    <th className="py-2 pr-3 text-right">가격</th>
                    <th className="py-2 pr-3 text-right">수량</th>
                    <th className="py-2 pr-3 text-right">금액</th>
                    <th className="py-2 pr-3 text-right">실현손익</th>
                    <th className="py-2 pr-3">메모</th>
                    <th className="py-2 pr-3">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const isEditing = editingId === t.id
                    if (isEditing) {
                      return (
                        <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="py-1.5 pr-3">
                            <input
                              type="date"
                              aria-label="거래 날짜 수정"
                              value={editDraft.transaction_date}
                              onChange={(e) => setEditDraft((d) => ({ ...d, transaction_date: e.target.value }))}
                              className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="py-1.5 pr-3">
                            <select
                              aria-label="거래 유형 수정"
                              value={editDraft.transaction_type}
                              onChange={(e) => setEditDraft((d) => ({ ...d, transaction_type: e.target.value }))}
                              className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              <option value="BUY">매수</option>
                              <option value="SELL">매도</option>
                            </select>
                          </td>
                          <td className="py-1.5 pr-3">
                            <input
                              type="number" min="0" step="any"
                              aria-label="거래 가격 수정"
                              value={editDraft.price}
                              onChange={(e) => setEditDraft((d) => ({ ...d, price: e.target.value }))}
                              className="w-24 px-1.5 py-1 text-xs text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="py-1.5 pr-3">
                            <input
                              type="number" min="0" step="1"
                              aria-label="거래 수량 수정"
                              value={editDraft.quantity}
                              onChange={(e) => setEditDraft((d) => ({ ...d, quantity: e.target.value }))}
                              className="w-20 px-1.5 py-1 text-xs text-right border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="py-1.5 pr-3 text-right text-gray-400">-</td>
                          <td className="py-1.5 pr-3 text-right text-gray-400">-</td>
                          <td className="py-1.5 pr-3">
                            <input
                              type="text"
                              aria-label="거래 메모 수정"
                              value={editDraft.note}
                              onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))}
                              className="w-full px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="py-1.5 pr-3 space-x-2 whitespace-nowrap">
                            <button
                              onClick={() => handleEditSave(t.id)}
                              disabled={updateMutation.isPending}
                              className="text-primary-600 dark:text-primary-400 hover:underline text-xs"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditDraft(null) }}
                              className="text-gray-500 dark:text-gray-400 hover:underline text-xs"
                            >
                              취소
                            </button>
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-1.5 pr-3 text-gray-900 dark:text-gray-100">{t.transaction_date}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            t.transaction_type === 'BUY'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          }`}>
                            {TYPE_LABELS[t.transaction_type]}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-right text-gray-700 dark:text-gray-300">
                          {formatPrice(t.price)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-gray-700 dark:text-gray-300">
                          {formatNumber(t.quantity)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-gray-700 dark:text-gray-300">
                          {formatPrice(t.price * t.quantity)}
                        </td>
                        <td className={`py-1.5 pr-3 text-right font-medium ${getPriceChangeColor(t.realized_pnl)}`}>
                          {t.realized_pnl != null ? formatPrice(t.realized_pnl) : '-'}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400 truncate max-w-[8rem]">
                          {t.note || '-'}
                        </td>
                        <td className="py-1.5 pr-3 space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => startEdit(t)}
                            className="text-primary-600 dark:text-primary-400 hover:underline text-xs"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(t.id)}
                            disabled={deleteMutation.isPending}
                            className="text-red-600 dark:text-red-400 hover:underline text-xs"
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
    </div>
  )
}
