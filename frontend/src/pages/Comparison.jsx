import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { subMonths, format } from 'date-fns'
import PageHeader from '../components/common/PageHeader'
import DateRangeSelector from '../components/charts/DateRangeSelector'
import TickerSelector from '../components/comparison/TickerSelector'
import InvestmentSimulation from '../components/comparison/InvestmentSimulation'
import RiskReturnScatter from '../components/comparison/RiskReturnScatter'
import CorrelationHeatmap from '../components/comparison/CorrelationHeatmap'
import NormalizedPriceChart from '../components/comparison/NormalizedPriceChart'
import ComparisonTable from '../components/comparison/ComparisonTable'
import { apiService } from '../services/api'
import { CACHE_STALE_TIME_STATIC, CACHE_STALE_TIME_SLOW, COMPARE_MAX_TICKERS } from '../constants'

export default function Comparison() {
  const [selectedTickers, setSelectedTickers] = useState([])
  
  // 초기 날짜 범위 설정 (1개월)
  const initialDateRange = useMemo(() => {
    const today = new Date()
    const oneMonthAgo = subMonths(today, 1)
    return {
      start: format(oneMonthAgo, 'yyyy-MM-dd'),
      end: format(today, 'yyyy-MM-dd')
    }
  }, [])
  
  const [dateRange, setDateRange] = useState(initialDateRange)

  // 전체 종목 목록 조회
  const { data: tickers = [], isLoading: tickersLoading } = useQuery({
    queryKey: ['etfs'],
    queryFn: apiService.getETFs,
    staleTime: CACHE_STALE_TIME_STATIC, // 5분 (정적 데이터)
  })

  // 비교 데이터 조회
  const {
    data: comparisonData,
    isLoading: comparisonLoading,
    error: comparisonError,
    isFetching: comparisonFetching,
  } = useQuery({
    queryKey: ['comparison', selectedTickers, dateRange],
    queryFn: async () => {
      if (selectedTickers.length < 2) {
        return null
      }

      const params = {
        tickers: selectedTickers.join(','),
      }

      if (dateRange.start) params.start_date = dateRange.start
      if (dateRange.end) params.end_date = dateRange.end

      try {
        const result = await apiService.compareETFs(params)
        // 응답 데이터 검증
        if (result && result.normalized_prices && result.statistics) {
          return result
        } else {
          console.error('[Comparison] Invalid response format:', result)
          throw new Error('Invalid response format from server')
        }
      } catch (error) {
        console.error('[Comparison] Error fetching comparison data:', error)
        throw error
      }
    },
    enabled: selectedTickers.length >= 2,
    staleTime: CACHE_STALE_TIME_SLOW, // 1분 (종목 비교)
    retry: 1,
  })

  // 티커 정보 맵 생성
  const tickerInfoMap = useMemo(() => {
    return tickers.reduce((acc, ticker) => {
      acc[ticker.ticker] = ticker
      return acc
    }, {})
  }, [tickers])

  const handleSelectionChange = (newSelection) => {
    setSelectedTickers(newSelection)
  }

  const handleDateChange = (newDateRange) => {
    // DateRangeSelector는 { startDate, endDate, range } 형식으로 전달
    setDateRange({
      start: newDateRange.startDate,
      end: newDateRange.endDate
    })
  }

  const canCompare = selectedTickers.length >= 2 && selectedTickers.length <= COMPARE_MAX_TICKERS
  const showResults = canCompare && comparisonData

  return (
    <div className="animate-fadeIn">
      <PageHeader
        title="ETF Comparison"
        subtitle="종목간 비교 분석 - 투자 시뮬레이션, 위험·수익, 상관관계, 가격 추이"
      />

      {/* 종목 선택 */}
      {tickersLoading ? (
        <div className="card">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-400">종목 목록 로딩 중...</span>
          </div>
        </div>
      ) : (
        <TickerSelector
          tickers={tickers}
          selectedTickers={selectedTickers}
          onSelectionChange={handleSelectionChange}
          maxSelection={COMPARE_MAX_TICKERS}
        />
      )}

      {/* 날짜 범위 선택 (종목 2개 이상 선택 시 표시) */}
      {canCompare && (
        <div className="mt-6">
          <DateRangeSelector
            onDateRangeChange={handleDateChange}
            defaultRange="1m"
            initialStartDate={dateRange.start}
            initialEndDate={dateRange.end}
          />
        </div>
      )}

      {/* 비교 결과 */}
      {canCompare && (
        <div className="mt-6 space-y-6">
          {(comparisonLoading || comparisonFetching) && (
            <div className="card">
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600 dark:text-gray-400">
                  비교 데이터 로딩 중... ({selectedTickers.length}개 종목)
                </span>
              </div>
            </div>
          )}

          {!comparisonLoading && !comparisonFetching && !comparisonData && !comparisonError && (
            <div className="card bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                    데이터가 없습니다
                  </h3>
                  <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
                    선택한 종목의 데이터를 불러올 수 없습니다. 날짜 범위를 조정하거나 잠시 후 다시 시도해주세요.
                  </p>
                </div>
              </div>
            </div>
          )}

          {comparisonError && (
            <div className="card bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-300">
                    데이터 로딩 실패
                  </h3>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                    {comparisonError.message || '비교 데이터를 불러오는 중 오류가 발생했습니다.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {showResults && comparisonData && (
            <>
              {/* 1. 투자 시뮬레이션 + 한줄 요약 */}
              <InvestmentSimulation
                statistics={comparisonData.statistics}
                tickerInfo={tickerInfoMap}
              />

              {/* 2. 위험-수익 산점도 */}
              <RiskReturnScatter
                statistics={comparisonData.statistics}
                tickerInfo={tickerInfoMap}
              />

              {/* 3. 상관관계 히트맵 */}
              <CorrelationHeatmap
                correlationMatrix={comparisonData.correlation_matrix}
                tickerInfo={tickerInfoMap}
              />

              {/* 4. 정규화 가격 차트 (기존) */}
              <NormalizedPriceChart
                data={comparisonData.normalized_prices}
                tickerInfo={tickerInfoMap}
                statistics={comparisonData.statistics}
              />

              {/* 5. 성과 비교 테이블 (기존) */}
              <ComparisonTable
                statistics={comparisonData.statistics}
                tickerInfo={tickerInfoMap}
              />
            </>
          )}
        </div>
      )}

      {/* 안내 메시지 (종목 선택 전) */}
      {!canCompare && selectedTickers.length > 0 && (
        <div className="mt-6 card bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
                {selectedTickers.length < 2 ? '종목을 더 선택해주세요' : `최대 ${COMPARE_MAX_TICKERS}개까지 선택 가능합니다`}
              </h3>
              <p className="mt-1 text-sm text-blue-700 dark:text-blue-400">
                {selectedTickers.length < 2
                  ? `현재 ${selectedTickers.length}개 선택됨. 최소 2개 이상의 종목을 선택해야 비교할 수 있습니다.`
                  : `현재 ${selectedTickers.length}개 선택됨. 최대 ${COMPARE_MAX_TICKERS}개까지 선택 가능합니다.`
                }
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
