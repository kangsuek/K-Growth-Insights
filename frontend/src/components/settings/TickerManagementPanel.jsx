import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { etfApi, settingsApi } from '../../services/api'
import { formatPrice, formatNumber } from '../../utils/format'
import TickerForm from './TickerForm'
import TickerDeleteConfirm from './TickerDeleteConfirm'

export default function TickerManagementPanel({ prefillStock }) {
  const queryClient = useQueryClient()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [selectedTicker, setSelectedTicker] = useState(null)
  const [formMode, setFormMode] = useState('create') // 'create' or 'edit'
  const [prefillData, setPrefillData] = useState(null) // 스크리닝에서 전달된 프리필 데이터
  const [highlightedTicker, setHighlightedTicker] = useState(null) // 순서 변경 시 하이라이트

  // 스크리닝에서 종목 추가 요청이 들어온 경우 자동으로 폼 오픈
  useEffect(() => {
    if (prefillStock) {
      setFormMode('create')
      setSelectedTicker(null)
      setPrefillData(prefillStock)
      setIsFormOpen(true)
    }
  }, [prefillStock])

  // 현재 종목 목록 조회 (stocks.json 기반)
  const { data: stocks, isLoading, error } = useQuery({
    queryKey: ['settings-stocks'],
    queryFn: async () => {
      const response = await settingsApi.getStocks()
      return response.data
    },
  })

  // 종목 추가 Mutation
  const createMutation = useMutation({
    mutationFn: (data) => settingsApi.createStock(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-stocks'] })
      queryClient.invalidateQueries({ queryKey: ['etfs'] }) // 대시보드 캐시도 무효화
      setIsFormOpen(false)
      alert('종목이 성공적으로 추가되었습니다.')
    },
    onError: (error) => {
      alert(`종목 추가 실패: ${error.message}`)
    },
  })

  // 종목 수정 Mutation
  const updateMutation = useMutation({
    mutationFn: ({ ticker, data }) => settingsApi.updateStock(ticker, data),
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['settings-stocks'] })
      queryClient.invalidateQueries({ queryKey: ['etfs'] }) // 대시보드 캐시도 무효화
      queryClient.invalidateQueries({ queryKey: ['etf', variables.ticker] }) // ETFDetail 페이지 캐시 무효화
      setIsFormOpen(false)
      setSelectedTicker(null)
      alert('종목이 성공적으로 수정되었습니다.')
    },
    onError: (error) => {
      alert(`종목 수정 실패: ${error.message}`)
    },
  })

  // 종목 삭제 Mutation
  const deleteMutation = useMutation({
    mutationFn: (ticker) => settingsApi.deleteStock(ticker),
    onSuccess: (response, deletedTicker) => {
      // 삭제 직후 목록에서 제거되도록 React Query 캐시 즉시 업데이트
      queryClient.setQueryData(['settings-stocks'], (oldStocks) => {
        if (!Array.isArray(oldStocks)) return oldStocks
        return oldStocks.filter((stock) => stock.ticker !== deletedTicker)
      })

      queryClient.invalidateQueries({ queryKey: ['settings-stocks'] })
      queryClient.invalidateQueries({ queryKey: ['etfs'] }) // 대시보드 캐시도 무효화
      setIsDeleteConfirmOpen(false)
      setSelectedTicker(null)
      const deleted = response.data.deleted
      alert(
        `종목이 삭제되었습니다.\n` +
        `- 가격 데이터: ${deleted.prices}개\n` +
        `- 뉴스: ${deleted.news}개\n` +
        `- 매매 동향: ${deleted.trading_flow}개`
      )
    },
    onError: (error) => {
      alert(`종목 삭제 실패: ${error.message}`)
    },
  })

  // 종목 순서 변경 Mutation
  const reorderMutation = useMutation({
    mutationFn: (tickers) => settingsApi.reorderStocks(tickers),
    onMutate: async (tickers) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['settings-stocks'] })
      const previousStocks = queryClient.getQueryData(['settings-stocks'])

      if (previousStocks) {
        const stockMap = new Map(previousStocks.map((s) => [s.ticker, s]))
        const reordered = tickers.map((ticker) => stockMap.get(ticker)).filter(Boolean)
        queryClient.setQueryData(['settings-stocks'], reordered)
      }

      return { previousStocks }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-stocks'] })
      queryClient.invalidateQueries({ queryKey: ['etfs'] }) // 대시보드 캐시도 무효화
    },
    onError: (error, tickers, context) => {
      alert(`순서 변경 실패: ${error.message}`)
      // Rollback
      if (context?.previousStocks) {
        queryClient.setQueryData(['settings-stocks'], context.previousStocks)
      }
    },
  })

  const handleAddClick = () => {
    setFormMode('create')
    setSelectedTicker(null)
    setIsFormOpen(true)
  }

  const handleEditClick = (stock) => {
    setFormMode('edit')
    setSelectedTicker(stock)
    setIsFormOpen(true)
  }

  const handleDeleteClick = (stock) => {
    setSelectedTicker(stock)
    setIsDeleteConfirmOpen(true)
  }

  const handleFormSubmit = (data) => {
    if (formMode === 'create') {
      createMutation.mutate(data)
    } else {
      updateMutation.mutate({ ticker: selectedTicker.ticker, data })
    }
  }

  const handleDeleteConfirm = () => {
    if (selectedTicker) {
      deleteMutation.mutate(selectedTicker.ticker)
    }
  }

  // 순서 변경 핸들러
  const handleMoveUp = (index) => {
    if (index === 0 || !stocks) return
    const newStocks = [...stocks]
    ;[newStocks[index - 1], newStocks[index]] = [newStocks[index], newStocks[index - 1]]
    
    // 이동한 종목 하이라이트
    const movedTicker = newStocks[index - 1].ticker
    setHighlightedTicker(movedTicker)
    setTimeout(() => setHighlightedTicker(null), 1500) // 1.5초 후 하이라이트 제거

    // 백엔드에 저장 (낙관적 업데이트/롤백은 mutation의 onMutate/onError에서 처리)
    const tickers = newStocks.map(s => s.ticker)
    reorderMutation.mutate(tickers)
  }

  const handleMoveDown = (index) => {
    if (!stocks || index === stocks.length - 1) return
    const newStocks = [...stocks]
    ;[newStocks[index], newStocks[index + 1]] = [newStocks[index + 1], newStocks[index]]
    
    // 이동한 종목 하이라이트
    const movedTicker = newStocks[index + 1].ticker
    setHighlightedTicker(movedTicker)
    setTimeout(() => setHighlightedTicker(null), 1500) // 1.5초 후 하이라이트 제거

    // 백엔드에 저장 (낙관적 업데이트/롤백은 mutation의 onMutate/onError에서 처리)
    const tickers = newStocks.map(s => s.ticker)
    reorderMutation.mutate(tickers)
  }

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 transition-colors">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 transition-colors">
        <div className="text-red-600 dark:text-red-400">
          <p className="font-semibold">오류 발생</p>
          <p className="text-sm mt-2">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow transition-colors">
      {/* 헤더 */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-left">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">종목 관리</h2>
          </div>
          <button
            onClick={handleAddClick}
            className="w-full sm:w-auto px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 종목 추가
          </button>
        </div>
      </div>

      {/* 데스크톱 테이블 (md 이상) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-24">
                순서
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-28">
                티커
              </th>
              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                종목명
              </th>
              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                타입
              </th>
              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                테마
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                매입가
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                수량
              </th>
              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {stocks && stocks.length > 0 ? (
              stocks.map((stock, index) => (
                <tr 
                  key={stock.ticker} 
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    highlightedTicker === stock.ticker 
                      ? 'animate-pulse ring-2 ring-primary-500 dark:ring-primary-400 bg-primary-50 dark:bg-primary-900/20' 
                      : ''
                  }`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0 || reorderMutation.isPending}
                        className="p-0.5 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="위로 이동"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleMoveDown(index)}
                        disabled={index === stocks.length - 1 || reorderMutation.isPending}
                        className="p-0.5 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="아래로 이동"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {stock.ticker}
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {stock.name}
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      stock.type === 'ETF'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300'
                        : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300'
                    }`}>
                      {stock.type}
                    </span>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {stock.theme}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">
                    {stock.purchase_price ? formatPrice(stock.purchase_price) : <span className="text-gray-300 dark:text-gray-600">-</span>}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">
                    {stock.quantity ? formatNumber(stock.quantity) : <span className="text-gray-300 dark:text-gray-600">-</span>}
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-left text-sm font-medium">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleEditClick(stock)}
                        className="p-1.5 text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
                        title="수정"
                        aria-label="수정"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteClick(stock)}
                        className="p-1.5 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="삭제"
                        aria-label="삭제"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  등록된 종목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 뷰 (md 미만) */}
      <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
        {stocks && stocks.length > 0 ? (
          stocks.map((stock, index) => (
            <div 
              key={stock.ticker} 
              className={`p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                highlightedTicker === stock.ticker 
                  ? 'animate-pulse ring-2 ring-primary-500 dark:ring-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-lg' 
                  : ''
              }`}
            >
              <div className="flex items-start gap-2 mb-2">
                {/* 순서 변경 버튼 */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0 || reorderMutation.isPending}
                    className="p-0.5 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="위로 이동"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === stocks.length - 1 || reorderMutation.isPending}
                    className="p-0.5 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="아래로 이동"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                
                {/* 종목 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {stock.name}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                      stock.type === 'ETF'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300'
                        : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300'
                    }`}>
                      {stock.type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{stock.ticker}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-1">{stock.theme}</p>
                  {(stock.purchase_price || stock.quantity) && (
                    <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {stock.purchase_price && <span>매입가: {formatPrice(stock.purchase_price)}</span>}
                      {stock.quantity && <span>수량: {formatNumber(stock.quantity)}</span>}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEditClick(stock)}
                  className="flex-1 px-3 py-2 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                  title="수정"
                  aria-label="수정"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>수정</span>
                </button>
                <button
                  onClick={() => handleDeleteClick(stock)}
                  className="flex-1 px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                  title="삭제"
                  aria-label="삭제"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>삭제</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            등록된 종목이 없습니다.
          </div>
        )}
      </div>

      {/* 모달들 */}
      {isFormOpen && (
        <TickerForm
          mode={formMode}
          initialData={selectedTicker}
          prefillData={formMode === 'create' ? prefillData : null}
          onSubmit={handleFormSubmit}
          onClose={() => {
            setIsFormOpen(false)
            setSelectedTicker(null)
            setPrefillData(null)
          }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {isDeleteConfirmOpen && (
        <TickerDeleteConfirm
          ticker={selectedTicker}
          onConfirm={handleDeleteConfirm}
          onClose={() => {
            setIsDeleteConfirmOpen(false)
            setSelectedTicker(null)
          }}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
