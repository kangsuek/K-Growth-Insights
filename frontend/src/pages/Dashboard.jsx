import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { etfApi, dataApi, settingsApi } from '../services/api'
import { formatRefreshInterval } from '../utils/format'
import ETFCardSkeleton from '../components/common/ETFCardSkeleton'
import PageHeader from '../components/common/PageHeader'
import DashboardFilters from '../components/dashboard/DashboardFilters'
import ETFCardGrid from '../components/dashboard/ETFCardGrid'
import PortfolioHeatmap from '../components/dashboard/PortfolioHeatmap'
import RecommendationCards from '../components/dashboard/RecommendationCards'
import MarketOverview from '../components/dashboard/MarketOverview'
import StockContextMenu from '../components/dashboard/StockContextMenu'
import TickerDeleteConfirm from '../components/settings/TickerDeleteConfirm'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { CACHE_STALE_TIME_STATIC, CACHE_STALE_TIME_FAST, CACHE_STALE_TIME_STATUS } from '../constants'

// 자동 갱신 알림 표시 시간. 최소 30초마다 반복되므로 성공은 짧게, 실패는 놓치지
// 않도록 길게 띄운다.
const AUTO_REFRESH_TOAST_MS = 1500
const AUTO_REFRESH_ERROR_TOAST_MS = 5000

// 자동 갱신이 다시 읽는 쿼리들.
export const AUTO_REFRESH_QUERY_KEYS = ['market-overview', 'etfs', 'batch-summary', 'scheduler-status']

// 수동 새로고침이 수집할 일수.
const MANUAL_COLLECT_DAYS = 1

/**
 * 수동 새로고침: 네이버에서 수집해 DB를 갱신하고, 그 DB를 다시 읽어 화면을 갱신한다.
 *
 * 순서가 중요하다. 수집이 끝난 뒤에 읽어야 새 데이터가 화면에 온다.
 * 재조회에도 throwOnError를 켠다 — 켜지 않으면 수집만 성공하고 화면 재조회가 모두
 * 실패해도 '갱신되었습니다'가 떠서, 옛 데이터를 보면서 최신인 줄 알게 된다.
 *
 * @returns {Promise<boolean>} 전 과정 성공 여부
 */
export async function collectAndRefreshDashboard(queryClient, toast) {
  const opts = { throwOnError: true }
  try {
    // 1. 시장 지수는 실시간 API라 수집을 기다릴 필요가 없다. 먼저 갱신해 체감을 줄인다.
    await queryClient.refetchQueries({ queryKey: ['market-overview'] }, opts)

    // 2. 네이버에서 수집해 DB 갱신.
    toast.info('데이터 수집 중... 잠시 기다려주세요', 3000)
    const response = await dataApi.collectAll(MANUAL_COLLECT_DAYS)

    // 3. 갱신된 DB를 다시 읽어 화면 갱신.
    for (const key of AUTO_REFRESH_QUERY_KEYS) {
      await queryClient.refetchQueries({ queryKey: [key] }, opts)
    }

    // 일부 종목만 실패해도 HTTP는 200이라 결과를 직접 확인해야 한다.
    const failed = response?.data?.result?.fail_count ?? 0
    if (failed > 0) {
      const total = response?.data?.result?.total_tickers ?? 0
      toast.warning(`${total}개 중 ${failed}개 종목 수집 실패, 나머지는 갱신했습니다`, 4000)
      return false
    }
    toast.info('데이터가 수집되었습니다', 2000)
    return true
  } catch (error) {
    console.error('Refresh failed:', error)
    // 수집이 실패해도 화면은 DB의 기존 데이터로 맞춰 둔다.
    await queryClient.invalidateQueries()
    toast.warning(`갱신 실패: ${error.message}`, 4000)
    return false
  }
}

/**
 * 자동 갱신: 수집 없이 화면 데이터만 다시 읽고 결과를 알린다.
 *
 * 수집(collectAll)은 종목당 6요청 × 전체 종목이라 주기 실행 시 네이버 API 호출이
 * 폭증한다(뉴스 검색이 429로 막힌 원인). 수집은 수동 버튼·스케줄러에만 맡긴다.
 *
 * @returns {Promise<boolean>} 성공 여부
 */
export async function autoRefreshDashboard(queryClient, toast) {
  // 백엔드 스케줄러가 실제로 새 수집을 끝냈는지는 scheduler-status의
  // last_collection_time이 바뀌었는지로 판단한다(재조회 전 값과 비교).
  const prevCollectedAt = queryClient.getQueryData(['scheduler-status'])?.last_collection_time
  try {
    // throwOnError 없이는 refetchQueries가 실패를 삼켜(promise.catch(noop))
    // catch로 오지 않는다. 실패 알림을 띄우려면 반드시 켜야 한다.
    const opts = { throwOnError: true }
    for (const key of AUTO_REFRESH_QUERY_KEYS) {
      await queryClient.refetchQueries({ queryKey: [key] }, opts)
    }
    // 주기마다 반복되므로 성공 알림은 짧게 띄운다.
    toast.success('데이터가 새로고침 되었습니다.', AUTO_REFRESH_TOAST_MS)

    // 스케줄러의 자동 수집이 이번 주기 사이에 끝났으면 별도로 알린다
    // (새로고침 알림과 달리, 실제로 새 데이터가 수집됐을 때만 뜬다).
    const newCollectedAt = queryClient.getQueryData(['scheduler-status'])?.last_collection_time
    if (prevCollectedAt && newCollectedAt && newCollectedAt !== prevCollectedAt) {
      toast.info('데이터가 수집되었습니다', AUTO_REFRESH_TOAST_MS)
    }
    return true
  } catch (error) {
    console.error('Auto refetch failed:', error)
    // 실패를 조용히 넘기면 백엔드가 죽어도 화면상 알 수 없다. 더 오래 띄운다.
    toast.error(`자동 갱신 실패: ${error.message}`, AUTO_REFRESH_ERROR_TOAST_MS)
    return false
  }
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const { settings, updateSettings } = useSettings()
  const toast = useToast()
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  // 기본 정렬은 'config' (stocks.json 순서)
  // 저장된 카드 순서가 있으면 'custom' 모드로 시작
  const [sortBy, setSortBy] = useState(() =>
    settings.cardOrder && settings.cardOrder.length > 0 ? 'custom' : 'config'
  )
  const [sortDirection, setSortDirection] = useState('asc') // 'asc', 'desc'
  // 히트맵/카드 우클릭 컨텍스트 메뉴 및 종목 삭제 확인 모달 상태
  const [contextMenu, setContextMenu] = useState(null) // { x, y, ticker, name }
  const [deleteTarget, setDeleteTarget] = useState(null) // { ticker, name }

  const handleContextMenu = useCallback((x, y, ticker, name) => {
    setContextMenu({ x, y, ticker, name })
  }, [])

  // 종목 삭제 Mutation (설정 > 종목관리목록과 동일한 API 사용)
  const deleteMutation = useMutation({
    mutationFn: (ticker) => settingsApi.deleteStock(ticker),
    onSuccess: (_response, deletedTicker) => {
      queryClient.setQueryData(['etfs'], (oldEtfs) =>
        Array.isArray(oldEtfs) ? oldEtfs.filter((etf) => etf.ticker !== deletedTicker) : oldEtfs
      )
      queryClient.invalidateQueries({ queryKey: ['etfs'] })
      queryClient.invalidateQueries({ queryKey: ['settings-stocks'] })
      queryClient.removeQueries({ queryKey: ['prices', deletedTicker] })
      queryClient.removeQueries({ queryKey: ['trading-flow', deletedTicker] })
      queryClient.removeQueries({ queryKey: ['news', deletedTicker] })
      toast.success('종목이 삭제되었습니다.', 2000)
      setDeleteTarget(null)
    },
    onError: (error) => {
      toast.error(`종목 삭제 실패: ${error.message}`, 3000)
    },
  })

  // 스케줄러 상태 조회 (마지막 수집 시각). 'scheduler-status'는 AUTO_REFRESH_QUERY_KEYS에
  // 포함돼 아래 자동 갱신 루프가 설정한 간격마다 다시 읽어준다(별도 refetchInterval 불필요).
  const { data: schedulerStatus } = useQuery({
    queryKey: ['scheduler-status'],
    queryFn: async () => {
      const response = await dataApi.getSchedulerStatus()
      return response.data.scheduler
    },
    retry: 1,
    staleTime: CACHE_STALE_TIME_STATUS, // 10초 (상태 정보)
  })

  // 전체 데이터 새로고침 (로직은 collectAndRefreshDashboard 참고).
  const handleRefreshAll = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await collectAndRefreshDashboard(queryClient, toast)
      setLastUpdate(new Date())
    } finally {
      setIsRefreshing(false)
    }
  }, [queryClient, isRefreshing, toast])

  // 자동 갱신용 (로직은 autoRefreshDashboard 참고).
  const handleRefetchOnly = useCallback(async () => {
    if (await autoRefreshDashboard(queryClient, toast)) {
      setLastUpdate(new Date())
    }
  }, [queryClient, toast])

  // 전체 종목 목록 조회
  const { data: etfs, isLoading: etfsLoading, error, refetch } = useQuery({
    queryKey: ['etfs'],
    queryFn: async () => {
      const response = await etfApi.getAll()
      return response.data
    },
    retry: 2,
    staleTime: CACHE_STALE_TIME_STATIC, // 5분 (정적 데이터)
    refetchOnWindowFocus: true, // 윈도우 포커스 시 자동 갱신
  })

  // 배치 요약 데이터 조회 (N+1 쿼리 최적화)
  const { data: batchSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['batch-summary', etfs?.map(e => e.ticker)],
    queryFn: async () => {
      if (!etfs || etfs.length === 0) return null
      const tickers = etfs.map(e => e.ticker)
      const response = await etfApi.getBatchSummary(tickers, 14, 5)  // 14 캘린더일 = 주말 포함 최소 10 거래일 (주간수익률 계산에 prices[4] 필요)
      return response.data.data  // response.data.data = {ticker: summary}
    },
    enabled: !!etfs && etfs.length > 0,  // etfs가 로드된 후에만 실행
    retry: 1,
    staleTime: CACHE_STALE_TIME_FAST, // 30초 (배치 요약)
  })

  const isLoading = etfsLoading || summaryLoading

  // 자동 갱신은 항상 켜져 있다. 설정한 주기마다 화면 데이터만 다시 읽는다(수집은 하지 않음).
  useEffect(() => {
    const interval = setInterval(() => {
      handleRefetchOnly()
    }, settings.autoRefresh.interval)
    return () => clearInterval(interval)
  }, [settings.autoRefresh.interval, handleRefetchOnly])

  // 오늘 날짜 포맷팅
  const formatDate = (date) => {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
  }

  // 업데이트 시간 포맷팅
  const formatUpdateTime = (date) => {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  // 정렬 변경 핸들러
  const handleSortChange = (newSortBy) => {
    if (sortBy === newSortBy) {
      // 같은 컬럼을 클릭하면 방향 전환
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // 다른 컬럼을 클릭하면 오름차순으로 시작
      setSortBy(newSortBy)
      setSortDirection('asc')
    }
  }

  // 종목 순서 변경 Mutation (백엔드 동기화)
  const reorderMutation = useMutation({
    mutationFn: (newOrder) => settingsApi.reorderStocks(newOrder),
    onMutate: async (newOrder) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['etfs'] })
      const previousETFs = queryClient.getQueryData(['etfs'])
      
      // ETF 데이터를 새 순서대로 정렬 (Map 기반 O(n) 룩업)
      if (previousETFs) {
        const etfMap = new Map(previousETFs.map(etf => [etf.ticker, etf]))
        const reordered = newOrder.map(ticker => etfMap.get(ticker)).filter(Boolean)
        queryClient.setQueryData(['etfs'], reordered)
      }
      
      return { previousETFs }
    },
    onSuccess: () => {
      // 백엔드와 프론트엔드 캐시 모두 무효화
      queryClient.invalidateQueries({ queryKey: ['etfs'] })
      queryClient.invalidateQueries({ queryKey: ['settings-stocks'] })
      toast.success('종목 순서가 성공적으로 변경되었습니다.', 2000)
    },
    onError: (error, newOrder, context) => {
      toast.error(`순서 변경 실패: ${error.message}`, 3000)
      // Rollback
      if (context?.previousETFs) {
        queryClient.setQueryData(['etfs'], context.previousETFs)
      }
    },
  })

  // 카드 순서 변경 핸들러 (대시보드 드래그 앤 드롭)
  const handleOrderChange = useCallback((newOrder) => {
    // 로컬 설정 업데이트 (custom 모드용)
    updateSettings('cardOrder', newOrder)

    // 백엔드 stocks.json 동기화
    reorderMutation.mutate(newOrder)
  }, [updateSettings, reorderMutation])

  // 정렬된 데이터 가져오기 (메모이제이션)
  const sortedETFs = useMemo(() => {
    if (!etfs) return []

    // 커스텀 순서가 있고, sortBy가 'custom'이면 커스텀 순서 사용
    if (sortBy === 'custom' && settings.cardOrder && settings.cardOrder.length > 0) {
      const orderMap = new Map(settings.cardOrder.map((ticker, index) => [ticker, index]))
      return [...etfs].sort((a, b) => {
        const orderA = orderMap.get(a.ticker) ?? Infinity
        const orderB = orderMap.get(b.ticker) ?? Infinity
        return orderA - orderB
      })
    }

    // 'config' 모드: 백엔드에서 이미 stocks.json 순서대로 정렬됨
    if (sortBy === 'config') {
      return etfs
    }

    // 기본 정렬 로직
    const sorted = [...etfs].sort((a, b) => {
      let compareValue = 0

      switch (sortBy) {
        case 'type': {
          // STOCK이 ETF보다 먼저 오도록 (STOCK = 0, ETF = 1)
          const typeOrder = { 'STOCK': 0, 'ETF': 1 }
          compareValue = typeOrder[a.type] - typeOrder[b.type]
          // 타입이 같으면 이름순으로 정렬
          if (compareValue === 0) {
            compareValue = a.name.localeCompare(b.name, 'ko-KR')
          }
          break
        }

        case 'name':
          compareValue = a.name.localeCompare(b.name, 'ko-KR')
          break

        case 'theme': {
          const themeA = a.theme || ''
          const themeB = b.theme || ''
          compareValue = themeA.localeCompare(themeB, 'ko-KR')
          // 테마가 같으면 이름순으로 정렬
          if (compareValue === 0) {
            compareValue = a.name.localeCompare(b.name, 'ko-KR')
          }
          break
        }

        default:
          compareValue = 0
      }

      return sortDirection === 'asc' ? compareValue : -compareValue
    })

    return sorted
  }, [etfs, sortBy, sortDirection, settings.cardOrder])

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="animate-fadeIn">
        <PageHeader title="Insights Dashboard" subtitle="한국 고성장 섹터 종합 분석" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {[...Array(6)].map((_, index) => (
            <ETFCardSkeleton key={index} />
          ))}
        </div>
      </div>
    )
  }

  // 에러 상태
  if (error) {
    return (
      <div className="animate-fadeIn">
        <PageHeader title="Insights Dashboard" subtitle="한국 고성장 섹터 종합 분석" />
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center max-w-2xl mx-auto">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-red-800 mb-2">
            데이터를 불러올 수 없습니다
          </h2>
          <p className="text-red-600 mb-6">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="btn btn-primary"
            aria-label="다시 시도"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  // 빈 데이터 상태
  if (!etfs || etfs.length === 0) {
    return (
      <div className="animate-fadeIn">
        <PageHeader title="Insights Dashboard" subtitle="한국 고성장 섹터 종합 분석" />
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center max-w-2xl mx-auto transition-colors">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
            등록된 종목이 없습니다
          </h2>
          <p className="text-gray-600 dark:text-gray-400">종목 데이터를 추가해주세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fadeIn">
      {/* 헤더 */}
      <PageHeader
        title="Insights Dashboard"
        subtitle={
          <span>
            총 <span className="font-semibold text-primary">{etfs.length}</span>개 종목
          </span>
        }
      />

      {/* 정렬 컨트롤 */}
      <DashboardFilters
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
      />

      {/* 날짜 및 업데이트 정보 */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm transition-colors">
        <div className="flex flex-col gap-2">
          {/* 오늘 날짜 */}
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{formatDate(new Date())}</span>
          </div>

          {/* 수집/업데이트 시간 정보 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            {/* 마지막 수집일시 (스케줄러) */}
            {schedulerStatus?.last_collection_time && (
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  마지막 수집일시: <span className="font-medium text-success">{formatUpdateTime(new Date(schedulerStatus.last_collection_time))}</span>
                </span>
              </div>
            )}

            {/* 화면 업데이트 시간 */}
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                마지막 업데이트: <span className="font-medium text-gray-700 dark:text-gray-300">{formatUpdateTime(lastUpdate)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* 컨트롤 버튼 */}
        <div className="flex items-center gap-3">
          {/* 자동 갱신 주기 표시 (자동 갱신은 항상 켜져 있어 끄는 조작이 없다) */}
          <span className="text-sm text-gray-600 dark:text-gray-400">
            자동 갱신 ({formatRefreshInterval(settings.autoRefresh.interval)})
          </span>

          {/* 수동 새로고침 버튼 */}
          <button
            onClick={handleRefreshAll}
            className="btn btn-outline btn-sm"
            disabled={isRefreshing}
            aria-label="모든 데이터 새로고침"
            title="최신 데이터 수집 후 갱신"
          >
            <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline ml-1">{isRefreshing ? '수집 중...' : '새로고침'}</span>
          </button>
        </div>
      </div>

      {/* 시장 개요 (KOSPI / KOSDAQ) */}
      <MarketOverview />

      {/* 포트폴리오 히트맵 (전체 조감) */}
      <PortfolioHeatmap
        etfs={sortedETFs}
        batchSummary={batchSummary}
        onContextMenu={handleContextMenu}
      />

      {/* ETF 추천 카드 */}
      <RecommendationCards />

      {/* 종목 그리드 */}
      <ETFCardGrid
        etfs={sortedETFs}
        batchSummary={batchSummary}
        onOrderChange={(newOrder) => {
          handleOrderChange(newOrder)
          // 드래그로 순서를 변경하면 자동으로 커스텀 정렬 모드로 전환
          if (sortBy !== 'custom') {
            setSortBy('custom')
          }
        }}
        onContextMenu={handleContextMenu}
      />

      {/* 히트맵/카드 우클릭 컨텍스트 메뉴 */}
      {contextMenu && (
        <StockContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          ticker={contextMenu.ticker}
          name={contextMenu.name}
          onClose={() => setContextMenu(null)}
          onDelete={() => {
            setDeleteTarget({ ticker: contextMenu.ticker, name: contextMenu.name })
            setContextMenu(null)
          }}
        />
      )}

      {/* 종목 삭제 확인 모달 */}
      {deleteTarget && (
        <TickerDeleteConfirm
          ticker={deleteTarget}
          isDeleting={deleteMutation.isPending}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.ticker)}
        />
      )}
    </div>
  )
}
