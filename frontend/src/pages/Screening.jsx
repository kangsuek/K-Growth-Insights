import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { scannerApi } from '../services/api'
import PageHeader from '../components/common/PageHeader'
import ScreeningFilters from '../components/screening/ScreeningFilters'
import ScreeningTable from '../components/screening/ScreeningTable'
import ScreeningHeatmap from '../components/screening/ScreeningHeatmap'
import ThemeExplorer from '../components/screening/ThemeExplorer'
import LoadingIndicator from '../components/common/LoadingIndicator'
import { useToast } from '../contexts/ToastContext'
import { CACHE_STALE_TIME_FAST } from '../constants'

const TABS = [
  { id: 'search', label: '조건 검색' },
  { id: 'theme', label: '테마 탐색' },
]

const SORT_OPTIONS = [
  { value: 'weekly_return', label: '주간수익률' },
  { value: 'daily_change_pct', label: '등락률' },
  { value: 'volume', label: '거래량' },
  { value: 'close_price', label: '현재가' },
  { value: 'foreign_net', label: '외국인' },
  { value: 'institutional_net', label: '기관' },
  { value: 'name', label: '종목명' },
]

// ISO 타임스탬프(예: "2026-07-20T16:10:00")를 "07/20 16:10" 형태로 표시
function formatCollectedAt(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

const DEFAULT_FILTERS = {
  q: undefined,
  market: 'ETF',
  sector: undefined,
  min_weekly_return: undefined,
  max_weekly_return: undefined,
  foreign_net_positive: undefined,
  institutional_net_positive: undefined,
  sort_by: 'weekly_return',
  sort_dir: 'desc',
  page: 1,
  page_size: 20,
}

export default function Screening() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('search')
  const [viewMode, setViewMode] = useState('table') // 'table' | 'heatmap'
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [isCollecting, setIsCollecting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [freshInfo, setFreshInfo] = useState(null) // 최신이라 재수집 확인 대기 중 { lastUpdated }
  const pollingRef = useRef(null)
  const startingRef = useRef(false) // collectData() 요청이 아직 서버에 반영되기 전 구간
  const requestingRef = useRef(false) // collectData() 요청 in-flight (중복 클릭 방지)

  // 히트맵 모드에서는 50개씩, 테이블은 기존 page_size
  const effectivePageSize = viewMode === 'heatmap' ? 50 : filters.page_size

  // 조건 검색 쿼리
  const { data, isLoading, error } = useQuery({
    queryKey: ['scanner', { ...filters, page_size: effectivePageSize }],
    queryFn: async () => {
      const params = {}
      for (const [key, val] of Object.entries(filters)) {
        if (val !== undefined) params[key] = val
      }
      params.page_size = effectivePageSize
      const res = await scannerApi.search(params)
      return res.data
    },
    enabled: activeTab === 'search',
    staleTime: CACHE_STALE_TIME_FAST,
    placeholderData: keepPreviousData,
  })

  // 진행률 폴링
  useEffect(() => {
    if (!isCollecting) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      return
    }

    const poll = async () => {
      try {
        const res = await scannerApi.getCollectProgress()
        const p = res.data

        if (p.status === 'completed') {
          // 폴링 즉시 중지 후 상태 업데이트
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setIsCollecting(false)
          setProgress(null)
          toast.success(p.message || '데이터 수집 완료!', 3000)
          queryClient.invalidateQueries({ queryKey: ['scanner'] })
          queryClient.invalidateQueries({ queryKey: ['scanner-themes'] })
          queryClient.invalidateQueries({ queryKey: ['scanner-recommendations'] })
        } else if (p.status === 'cancelled') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setIsCollecting(false)
          setProgress(null)
          toast.info(p.message || '수집이 중지되었습니다.', 3000)
          queryClient.invalidateQueries({ queryKey: ['scanner'] })
          queryClient.invalidateQueries({ queryKey: ['scanner-themes'] })
        } else if (p.status === 'error') {
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setIsCollecting(false)
          setProgress(null)
          toast.error(p.message || '수집 중 오류 발생', 3000)
        } else if (p.status === 'idle') {
          // collectData() 요청 직후에는 아직 서버에 반영 안 됐을 수 있으므로 무시
          if (startingRef.current) return
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setIsCollecting(false)
          setProgress(null)
        } else {
          // in_progress: 서버가 수집 중임을 확인했으므로 starting 플래그 해제
          startingRef.current = false
          setProgress(p)
        }
      } catch {
        // 폴링 실패는 무시
      }
    }

    poll()
    pollingRef.current = setInterval(poll, 2000)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [isCollecting, queryClient, toast])

  // 외부(스케줄러/다른 탭/API 등)에서 시작된 수집도 감지한다.
  // 수집 중이 아닐 때 주기적으로 진행 상태를 확인하여, in_progress가 감지되면
  // isCollecting을 켜서 진행률 배너 + 폴링(위 effect)이 인계받도록 한다.
  useEffect(() => {
    if (isCollecting) return
    const checkRunning = async () => {
      try {
        const res = await scannerApi.getCollectProgress()
        if (res.data?.status === 'in_progress') {
          startingRef.current = false
          setIsCollecting(true)
          setProgress(res.data)
        }
      } catch {
        // 무시
      }
    }
    checkRunning() // 진입 시 즉시 1회
    const id = setInterval(checkRunning, 4000)
    return () => clearInterval(id)
  }, [isCollecting])

  const handleFilterChange = useCallback((partial) => {
    setFilters((prev) => ({ ...prev, ...partial, page: partial.page ?? 1 }))
  }, [])

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
  }, [])

  const handleSort = useCallback((column) => {
    setFilters((prev) => ({
      ...prev,
      sort_by: column,
      sort_dir: prev.sort_by === column && prev.sort_dir === 'desc' ? 'asc' : 'desc',
      page: 1,
    }))
  }, [])

  const handlePageChange = useCallback((newPage) => {
    setFilters((prev) => ({ ...prev, page: newPage }))
  }, [])

  const handleSectorClick = useCallback((sector) => {
    setActiveTab('search')
    setFilters({ ...DEFAULT_FILTERS, sector, market: 'ALL' })
  }, [])

  const handleCollectData = async (force = false) => {
    if (isCollecting || requestingRef.current) return
    requestingRef.current = true
    try {
      const res = await scannerApi.collectData(force)
      // 이미 최신: 진행률 배너 없이 재수집 여부 확인창만 표시
      if (res.data?.status === 'fresh') {
        setFreshInfo({ lastUpdated: res.data.last_updated })
        return
      }
      // started / already_running: 진행률 배너 + 폴링 시작
      startingRef.current = true
      setIsCollecting(true)
      setProgress({ status: 'in_progress', message: '수집 시작 중...' })
    } catch (err) {
      toast.error(`수집 실패: ${err.message}`, 3000)
    } finally {
      requestingRef.current = false
    }
  }

  // "이미 최신" 안내에서 사용자가 재수집을 확인한 경우에만 force=true 호출
  const handleConfirmForceCollect = () => {
    setFreshInfo(null)
    handleCollectData(true)
  }

  const handleCancelCollect = async () => {
    try {
      await scannerApi.cancelCollect()
      setProgress((prev) => prev ? { ...prev, message: '중지 요청 중...' } : prev)
    } catch {
      // 무시
    }
  }

  // 마지막 데이터 갱신 시각 (아이템 중 가장 최신 값)
  const lastUpdated = data?.items?.reduce((latest, item) => {
    if (!item.catalog_updated_at) return latest
    return !latest || item.catalog_updated_at > latest ? item.catalog_updated_at : latest
  }, null)

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="종목 발굴"
        subtitle="ETF 조건 검색 및 테마 탐색"
      />

      {/* 탭 바 + 데이터 수집 버튼 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => handleCollectData()}
          disabled={isCollecting}
          className="btn btn-outline btn-sm"
          title="ETF 가격/수급 데이터를 네이버 금융에서 수집합니다"
        >
          <svg className={`w-4 h-4 mr-1 ${isCollecting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {isCollecting ? '수집 중...' : '데이터 수집'}
        </button>
      </div>

      {/* 수집 진행률 배너 */}
      {isCollecting && progress && (
        <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 transition-colors">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                {progress.message || '데이터 수집 중...'}
              </p>
              {progress.percent != null && (
                <div className="mt-1.5 w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              )}
            </div>
            {progress.percent != null && (
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-300 flex-shrink-0 tabular-nums">
                {progress.percent}%
              </span>
            )}
            <button
              onClick={handleCancelCollect}
              className="flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              title="수집 중지"
            >
              중지
            </button>
          </div>
        </div>
      )}

      {/* 이미 최신 데이터 → 재수집 확인 모달 */}
      {freshInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full transition-colors">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                이미 최신 데이터입니다
              </h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                가장 최근 거래일 데이터를 이미 수집했습니다
                {freshInfo.lastUpdated && (
                  <> (<span className="font-medium">{formatCollectedAt(freshInfo.lastUpdated)}</span> 수집)</>
                )}
                . 그래도 다시 수집할까요?
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 rounded-b-lg flex gap-3">
              <button
                onClick={() => setFreshInfo(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-sm"
              >
                취소
              </button>
              <button
                onClick={handleConfirmForceCollect}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
              >
                다시 수집
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 탭 컨텐츠 */}
      {activeTab === 'search' && (
        <>
          <ScreeningFilters
            filters={filters}
            onFilterChange={handleFilterChange}
            onReset={handleReset}
            lastUpdated={lastUpdated}
          />

          {/* 뷰 모드 토글 + 정렬 */}
          <div className="flex items-center justify-between mb-3">
            {/* 정렬 (히트맵 모드에서도 사용 가능) */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">정렬</label>
              <select
                value={filters.sort_by}
                onChange={(e) => setFilters(prev => ({ ...prev, sort_by: e.target.value, page: 1 }))}
                className="text-xs border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => setFilters(prev => ({ ...prev, sort_dir: prev.sort_dir === 'desc' ? 'asc' : 'desc', page: 1 }))}
                className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={filters.sort_dir === 'desc' ? '내림차순' : '오름차순'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {filters.sort_dir === 'desc' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  )}
                </svg>
              </button>
            </div>

            {/* 뷰 모드 토글 */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => { setViewMode('table'); setFilters(prev => ({ ...prev, page: 1 })) }}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title="테이블 뷰"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => { setViewMode('heatmap'); setFilters(prev => ({ ...prev, page: 1 })) }}
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'heatmap'
                    ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title="히트맵 뷰"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <LoadingIndicator text="검색 중..." />
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
              <p className="text-red-600 dark:text-red-400 text-sm">{error.message}</p>
            </div>
          ) : viewMode === 'table' ? (
            <ScreeningTable
              items={data?.items || []}
              total={data?.total || 0}
              page={filters.page}
              pageSize={filters.page_size}
              sortBy={filters.sort_by}
              sortDir={filters.sort_dir}
              onSort={handleSort}
              onPageChange={handlePageChange}
            />
          ) : (
            <>
              <ScreeningHeatmap items={data?.items || []} />
              {/* 히트맵 모드에서도 페이지네이션 표시 */}
              {data && data.total > effectivePageSize && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => handlePageChange(filters.page - 1)}
                    disabled={filters.page <= 1}
                    className="btn btn-outline btn-sm"
                  >
                    이전
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
                    {filters.page} / {Math.ceil(data.total / effectivePageSize)}
                  </span>
                  <button
                    onClick={() => handlePageChange(filters.page + 1)}
                    disabled={filters.page >= Math.ceil(data.total / effectivePageSize)}
                    className="btn btn-outline btn-sm"
                  >
                    다음
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'theme' && (
        <ThemeExplorer
          onSectorClick={handleSectorClick}
          onCollectData={() => handleCollectData()}
          isCollecting={isCollecting}
        />
      )}
    </div>
  )
}
