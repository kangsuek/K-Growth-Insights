import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../contexts/ToastContext'
import { dataApi, settingsApi, getHealthCheck } from '../../services/api'

/**
 * 진행률 바 컴포넌트
 */
function ProgressBar({ current, total, message, colorClass = 'bg-primary-500' }) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="mt-3 space-y-1">
      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-600 dark:text-gray-300 truncate mr-2">
          {message}
        </span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
          {percentage}%
        </span>
      </div>
    </div>
  )
}

/**
 * 단계별 진행률 바 컴포넌트 (종목 목록 수집용)
 */
function StepProgressBar({ stepIndex, totalSteps, message, itemsCollected }) {
  const stepLabels = ['코스피', '코스닥', 'ETF', '저장']
  const percentage = totalSteps > 0 ? Math.round((stepIndex / totalSteps) * 100) : 0

  return (
    <div className="mt-3 space-y-2">
      {/* 단계 표시 */}
      <div className="flex items-center gap-1">
        {stepLabels.map((label, idx) => (
          <div key={label} className="flex items-center">
            <div
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                idx < stepIndex
                  ? 'bg-blue-500 text-white'
                  : idx === stepIndex
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 ring-1 ring-blue-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
              }`}
            >
              {label}
            </div>
            {idx < stepLabels.length - 1 && (
              <div className={`w-3 h-0.5 mx-0.5 ${idx < stepIndex ? 'bg-blue-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
            )}
          </div>
        ))}
      </div>
      {/* 프로그레스 바 */}
      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
        <div
          className="h-3 rounded-full transition-all duration-500 bg-blue-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-600 dark:text-gray-300 truncate mr-2">
          {message}
        </span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
          {itemsCollected > 0 ? `${itemsCollected.toLocaleString('ko-KR')}개 수집` : ''}
        </span>
      </div>
    </div>
  )
}

/**
 * 데이터 관리 패널 컴포넌트
 * 데이터 통계, 수집, 초기화 기능을 제공합니다.
 */
export default function DataManagementPanel() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [isCollectTickerCatalogModalOpen, setIsCollectTickerCatalogModalOpen] = useState(false)
  const [isCollectAllModalOpen, setIsCollectAllModalOpen] = useState(false)
  const [collectionDays, setCollectionDays] = useState(90)

  // 진행률 상태
  const [collectAllProgress, setCollectAllProgress] = useState(null)
  const [tickerCatalogProgress, setTickerCatalogProgress] = useState(null)
  const collectAllPollingRef = useRef(null)
  const tickerCatalogPollingRef = useRef(null)

  // 데이터 통계 조회
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['data-stats'],
    queryFn: async () => {
      const response = await dataApi.getStats()
      return response.data
    },
    refetchInterval: 30000, // 30초마다 자동 갱신
    refetchIntervalInBackground: true, // 탭이 백그라운드여도 갱신 유지 (긴 수집 중 탭 전환 대비)
    refetchOnWindowFocus: true, // 수집 후 탭으로 돌아오면 즉시 카운트 갱신 (전역 false를 이 쿼리만 override)
  })

  // 전체 데이터 수집 진행률 polling
  useEffect(() => {
    if (collectAllPollingRef.current) {
      clearInterval(collectAllPollingRef.current)
      collectAllPollingRef.current = null
    }

    if (!collectAllProgress || collectAllProgress.status === 'idle') return

    if (collectAllProgress.status === 'completed' || collectAllProgress.status === 'error') {
      return
    }

    collectAllPollingRef.current = setInterval(async () => {
      try {
        const response = await dataApi.getCollectProgress()
        const data = response.data
        setCollectAllProgress(data)
        if (data.status === 'completed' || data.status === 'error' || data.status === 'idle') {
          clearInterval(collectAllPollingRef.current)
          collectAllPollingRef.current = null
          // 진행바 완료 시점에 통계를 즉시 갱신
          if (data.status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ['data-stats'] })
          }
        }
      } catch {
        // polling 실패는 무시
      }
    }, 2000)

    return () => {
      if (collectAllPollingRef.current) {
        clearInterval(collectAllPollingRef.current)
        collectAllPollingRef.current = null
      }
    }
  }, [collectAllProgress?.status])

  // 종목 목록 수집 진행률 polling
  useEffect(() => {
    if (tickerCatalogPollingRef.current) {
      clearInterval(tickerCatalogPollingRef.current)
      tickerCatalogPollingRef.current = null
    }

    if (!tickerCatalogProgress || tickerCatalogProgress.status === 'idle') return

    if (tickerCatalogProgress.status === 'completed' || tickerCatalogProgress.status === 'error') {
      return
    }

    tickerCatalogPollingRef.current = setInterval(async () => {
      try {
        const response = await settingsApi.getTickerCatalogProgress()
        const data = response.data
        setTickerCatalogProgress(data)
        if (data.status === 'completed' || data.status === 'error' || data.status === 'idle') {
          clearInterval(tickerCatalogPollingRef.current)
          tickerCatalogPollingRef.current = null
          // 진행바 완료 시점에 통계(종목 목록 개수 등)를 즉시 갱신
          // (동기 mutation 응답 지연/실패와 무관하게 카운트가 바로 반영되도록)
          if (data.status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ['data-stats'] })
          }
        }
      } catch {
        // polling 실패는 무시
      }
    }, 2000)

    return () => {
      if (tickerCatalogPollingRef.current) {
        clearInterval(tickerCatalogPollingRef.current)
        tickerCatalogPollingRef.current = null
      }
    }
  }, [tickerCatalogProgress?.status])

  // 전체 데이터 수집 Mutation
  const collectMutation = useMutation({
    mutationFn: async (days) => {
      const response = await dataApi.collectAll(days)
      return response.data
    },
    onSuccess: (data) => {
      setCollectAllProgress({ status: 'completed', current: data.result.total_tickers, total: data.result.total_tickers, message: '수집 완료' })
      // 성공 메시지 표시
      const fundamentalsPart = data.result.fundamentals_success != null
        ? `, 펀더멘털: ${data.result.fundamentals_success.toLocaleString('ko-KR')}개 성공${data.result.fundamentals_failed > 0 ? `/${data.result.fundamentals_failed.toLocaleString('ko-KR')}개 실패` : ''}`
        : ''
      toast.success(
        `데이터 수집 완료! 가격: ${data.result.total_price_records.toLocaleString('ko-KR')}건, 매매 동향: ${data.result.total_trading_flow_records.toLocaleString('ko-KR')}건, 뉴스: ${data.result.total_news_records.toLocaleString('ko-KR')}건${fundamentalsPart}`,
        5000
      )

      // 모든 캐시 무효화하여 최신 데이터 반영
      queryClient.invalidateQueries()
    },
    onError: (error) => {
      setCollectAllProgress(null)
      toast.error(`데이터 수집 실패: ${error.message}`)
    },
  })

  // 종목 목록 수집 Mutation
  const collectTickerCatalogMutation = useMutation({
    mutationFn: async () => {
      const response = await settingsApi.collectTickerCatalog()
      return response.data
    },
    onSuccess: (data) => {
      setTickerCatalogProgress({ status: 'completed', step_index: 4, total_steps: 4, items_collected: data.total_collected, message: '수집 완료' })
      // 성공 메시지 표시 (실제 저장된 건수 사용)
      const savedCount = data.saved_count || data.total_collected
      const totalCollected = data.total_collected

      let message = `종목 목록 수집 완료! 저장: ${savedCount.toLocaleString('ko-KR')}개 (코스피: ${data.kospi_count.toLocaleString('ko-KR')}, 코스닥: ${data.kosdaq_count.toLocaleString('ko-KR')}, ETF: ${data.etf_count.toLocaleString('ko-KR')})`

      // 수집 건수와 저장 건수가 다를 경우 경고 표시
      if (totalCollected !== savedCount) {
        message += `\n수집: ${totalCollected.toLocaleString('ko-KR')}개, 저장: ${savedCount.toLocaleString('ko-KR')}개 (일부 저장 실패)`
      }

      toast.success(message, 5000)

      // 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['data-stats'] })
    },
    onError: (error) => {
      setTickerCatalogProgress(null)
      toast.error(`종목 목록 수집 실패: ${error.message}`)
    },
  })

  // 데이터베이스 초기화 Mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await dataApi.reset()
      return response.data
    },
    onSuccess: (data) => {
      setIsResetModalOpen(false)

      // 성공 메시지 표시
      const deletedCounts = [
        `가격: ${(data.deleted.prices || 0).toLocaleString('ko-KR')}건`,
        `뉴스: ${(data.deleted.news || 0).toLocaleString('ko-KR')}건`,
        `매매 동향: ${(data.deleted.trading_flow || 0).toLocaleString('ko-KR')}건`,
        `수집 상태: ${(data.deleted.collection_status || 0).toLocaleString('ko-KR')}건`,
        `분봉: ${(data.deleted.intraday_prices || 0).toLocaleString('ko-KR')}건`
      ].filter(item => !item.includes(': 0건')).join(', ')

      toast.success(
        `데이터베이스 초기화 완료. ${deletedCounts} 삭제됨`,
        5000
      )

      // 모든 React Query 캐시 삭제
      queryClient.clear()

      // 페이지 새로고침하여 모든 캐시 완전히 제거
      setTimeout(() => window.location.reload(), 1000)
    },
    onError: (error) => {
      toast.error(`데이터베이스 초기화 실패: ${error.message}`)
      setIsResetModalOpen(false)
    },
  })

  // 전체 데이터 수집 핸들러
  const handleCollectAll = () => {
    if (collectMutation.isPending) return

    setIsCollectAllModalOpen(true)
  }

  // 전체 데이터 수집 확인 핸들러
  const handleConfirmCollectAll = async () => {
    setIsCollectAllModalOpen(false)

    // 백엔드 연결 확인 (배포 시 백엔드 URL로 요청)
    try {
      await getHealthCheck()
    } catch (error) {
      toast.error('백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.')
      return
    }

    // 진행률 polling 시작
    setCollectAllProgress({ status: 'in_progress', current: 0, total: 0, message: '수집 시작 중...' })
    collectMutation.mutate(collectionDays)
  }

  // 종목 목록 수집 핸들러
  const handleCollectTickerCatalog = () => {
    if (collectTickerCatalogMutation.isPending) return
    setIsCollectTickerCatalogModalOpen(true)
  }

  // 종목 목록 수집 확인 핸들러
  const handleConfirmCollectTickerCatalog = async () => {
    setIsCollectTickerCatalogModalOpen(false)

    // 백엔드 연결 확인 (배포 시 백엔드 URL로 요청)
    try {
      await getHealthCheck()
    } catch (error) {
      toast.error('백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.')
      return
    }

    // 진행률 polling 시작
    setTickerCatalogProgress({ status: 'in_progress', step_index: 0, total_steps: 4, items_collected: 0, message: '수집 시작 중...' })
    collectTickerCatalogMutation.mutate()
  }

  // 데이터베이스 초기화 핸들러
  const handleReset = () => {
    if (resetMutation.isPending) return

    setIsResetModalOpen(true)
  }

  // 초기화 확인 모달 핸들러
  const handleConfirmReset = () => {
    resetMutation.mutate()
  }

  // 수집 소요 시간 문구 (60초 이상이면 분 단위로 표시)
  const formatCollectionDuration = (seconds) => {
    if (seconds >= 60) {
      const minutes = Math.ceil(seconds / 60)
      return minutes < 60 ? `약 ${minutes}분` : `약 ${Math.ceil(minutes / 60)}시간`
    }
    return `약 ${seconds}초`
  }

  // 날짜 포맷팅
  const formatDate = (dateStr) => {
    // null, undefined, 빈 문자열인 경우 "-" 반환
    if (dateStr === null || dateStr === undefined || dateStr === '') {
      return '-'
    }
    const date = new Date(dateStr)
    // 유효하지 않은 날짜인 경우도 "-" 반환
    if (isNaN(date.getTime())) {
      return '-'
    }
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 숫자 포맷팅 (천 단위 콤마)
  const formatNumber = (num) => {
    if (num === null || num === undefined) return '-'
    return new Intl.NumberFormat('ko-KR').format(num)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900">
      {/* 헤더 */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">데이터 관리</h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            데이터베이스 통계 및 수집 관리
          </p>
        </div>
      </div>

      {/* 내용 */}
      <div className="px-4 sm:px-6 py-6 space-y-8">
        {/* 데이터 통계 섹션 */}
        <section>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">데이터 통계</h3>

          {statsLoading ? (
            <div className="space-y-2">
              <div className="skeleton-text h-16"></div>
              <div className="skeleton-text h-16"></div>
            </div>
          ) : statsError ? (
            <div className="text-center py-4 text-sm text-red-600 dark:text-red-400">
              통계 조회 실패: {statsError.message}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* 종목 수 */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">종목 수</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatNumber(stats.etfs)}</div>
              </div>

              {/* 가격 레코드 */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">가격 레코드</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatNumber(stats.prices)}</div>
              </div>

              {/* 매매 동향 레코드 */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">매매 동향 레코드</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatNumber(stats.trading_flow)}</div>
              </div>

              {/* 뉴스 수 */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">뉴스 수</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatNumber(stats.news)}</div>
              </div>

              {/* 마지막 수집 시간 */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">마지막 수집</div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDate(stats.last_collection)}</div>
              </div>

              {/* DB 크기 */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">데이터베이스 크기</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.database_size_mb} MB</div>
              </div>
            </div>
          ) : null}
        </section>

        {/* 데이터 수집 섹션 */}
        <section className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">데이터 수집</h3>

          <div className="space-y-6">
            {/* 종목 목록 수집 */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">종목 목록 수집</h4>
                {stats && 'stock_catalog' in stats && stats.stock_catalog != null ? (
                  <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                    현재 {typeof stats.stock_catalog === 'number' ? stats.stock_catalog.toLocaleString('ko-KR') : stats.stock_catalog}개
                  </span>
                ) : statsLoading ? (
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">로딩 중...</span>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    수집 필요
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                네이버 금융에서 전체 종목 목록을 수집합니다. 새 종목 추가 시 자동완성 기능을 사용하려면 먼저 이 작업을 수행해야 합니다.
              </p>
              <button
                onClick={handleCollectTickerCatalog}
                disabled={collectTickerCatalogMutation.isPending}
                className="w-full sm:w-auto px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base font-medium"
              >
                {collectTickerCatalogMutation.isPending ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>종목 목록 수집 중...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <span>종목 목록 수집</span>
                  </>
                )}
              </button>

              {/* 종목 목록 수집 진행률 */}
              {collectTickerCatalogMutation.isPending && tickerCatalogProgress && tickerCatalogProgress.status === 'in_progress' && (
                <StepProgressBar
                  stepIndex={tickerCatalogProgress.step_index || 0}
                  totalSteps={tickerCatalogProgress.total_steps || 4}
                  message={tickerCatalogProgress.message || '수집 중...'}
                  itemsCollected={tickerCatalogProgress.items_collected || 0}
                />
              )}

              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                최초 1회 실행 권장. 이후에는 분기별 1회 정도 실행하면 충분합니다.
              </p>
            </div>

            {/* 가격/뉴스 데이터 수집 */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">가격/뉴스 데이터 수집</h4>

              {/* 수집 일수 선택 */}
              <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                수집 기간 (일)
              </label>
              <select
                value={collectionDays}
                onChange={(e) => setCollectionDays(Number(e.target.value))}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                disabled={collectMutation.isPending}
              >
                <option value={1}>1일 (당일)</option>
                <option value={7}>7일 (1주)</option>
                <option value={10}>10일</option>
                <option value={30}>30일 (1개월)</option>
                <option value={90}>90일 (3개월)</option>
                <option value={180}>180일 (6개월)</option>
                <option value={365}>365일 (1년)</option>
              </select>
            </div>

            {/* 전체 데이터 수집 버튼 */}
            <button
              onClick={handleCollectAll}
              disabled={collectMutation.isPending}
              className="w-full sm:w-auto px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base font-medium"
            >
              {collectMutation.isPending ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>데이터 수집 중...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>전체 데이터 수집</span>
                </>
              )}
            </button>

            {/* 전체 데이터 수집 진행률 */}
            {collectMutation.isPending && collectAllProgress && collectAllProgress.status === 'in_progress' && (
              <ProgressBar
                current={collectAllProgress.current || 0}
                total={collectAllProgress.total || 1}
                message={collectAllProgress.message || '수집 중...'}
              />
            )}

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              모든 종목의 가격, 매매 동향 데이터를 수집합니다. 소요 시간: {formatCollectionDuration(collectionDays * 6)}
            </p>
            </div>
          </div>
        </section>

        {/* 위험 작업 섹션 */}
        <section className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-start gap-3 mb-4">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-base font-semibold text-red-900 dark:text-red-100">위험 작업</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  아래 작업은 되돌릴 수 없습니다. 신중하게 실행하세요.
                </p>
              </div>
            </div>

            <button
              onClick={handleReset}
              disabled={resetMutation.isPending}
              className="w-full sm:w-auto px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base font-medium"
            >
              {resetMutation.isPending ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>초기화 중...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>데이터베이스 초기화</span>
                </>
              )}
            </button>

            <p className="text-xs text-red-700 dark:text-red-300 mt-2">
              종목 정보를 제외한 모든 데이터(가격, 뉴스, 매매 동향, 수집 상태, 분봉)가 삭제됩니다.
            </p>
          </div>
        </section>
      </div>

      {/* 초기화 확인 모달 */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">데이터베이스 초기화</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  정말로 모든 데이터를 삭제하시겠습니까?
                </p>
                <ul className="text-sm text-gray-600 dark:text-gray-400 mt-2 list-disc list-inside space-y-1">
                  <li>모든 가격 데이터 삭제</li>
                  <li>모든 뉴스 데이터 삭제</li>
                  <li>모든 매매 동향 데이터 삭제</li>
                  <li>모든 수집 상태 정보 삭제</li>
                  <li>모든 분봉 데이터 삭제</li>
                </ul>
                <p className="text-sm font-semibold text-red-600 dark:text-red-400 mt-3">
                  이 작업은 되돌릴 수 없습니다!
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                취소
              </button>
              <button
                onClick={handleConfirmReset}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 종목 목록 수집 확인 모달 */}
      {isCollectTickerCatalogModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <svg className="w-8 h-8 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">종목 목록 수집</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  전체 종목 목록(코스피, 코스닥, ETF)을 수집하시겠습니까?
                </p>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>소요 시간: 약 5-10분</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>이 작업은 새 종목 추가 시 자동완성 기능을 위해 필요합니다.</span>
                  </div>
                </div>
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-3 font-medium">
                  최초 1회 실행 권장. 이후에는 분기별 1회 정도 실행하면 충분합니다.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsCollectTickerCatalogModalOpen(false)}
                disabled={collectTickerCatalogMutation.isPending}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                onClick={handleConfirmCollectTickerCatalog}
                disabled={collectTickerCatalogMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {collectTickerCatalogMutation.isPending ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>수집 중...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>수집 시작</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 전체 데이터 수집 확인 모달 */}
      {isCollectAllModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <svg className="w-8 h-8 text-primary-600 dark:text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">전체 데이터 수집</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  최근 {collectionDays}일 데이터를 수집하시겠습니까?
                </p>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-primary-500 dark:text-primary-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>소요 시간: {formatCollectionDuration(collectionDays * 6)}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-primary-500 dark:text-primary-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>모든 종목의 가격, 매매 동향, 뉴스 데이터를 수집합니다.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-primary-500 dark:text-primary-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>펀더멘털 데이터(ETF: NAV·구성종목, 주식: PER·PBR·ROE 등)도 함께 수집됩니다.</span>
                  </div>
                </div>
                <p className="text-sm text-primary-600 dark:text-primary-400 mt-3 font-medium">
                  수집 기간은 상단의 드롭다운에서 변경할 수 있습니다.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsCollectAllModalOpen(false)}
                disabled={collectMutation.isPending}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                onClick={handleConfirmCollectAll}
                disabled={collectMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {collectMutation.isPending ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>수집 중...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>수집 시작</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
