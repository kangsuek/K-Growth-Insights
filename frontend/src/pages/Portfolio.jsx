import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { etfApi } from '../services/api'
import PageHeader from '../components/common/PageHeader'
import Spinner from '../components/common/Spinner'
import ErrorFallback from '../components/common/ErrorFallback'
import PortfolioSummaryCards from '../components/portfolio/PortfolioSummaryCards'
import AllocationPieChart from '../components/portfolio/AllocationPieChart'
import PortfolioTrendChart from '../components/portfolio/PortfolioTrendChart'
import ContributionTable from '../components/portfolio/ContributionTable'
import PortfolioAnalysisReport from '../components/portfolio/PortfolioAnalysisReport'
import AIInvestmentReport from '../components/portfolio/AIInvestmentReport'
import {
  classifyETFs,
  calculatePortfolioSummary,
  calculateAllocation,
  calculateDailyPortfolioTrend,
  calculateContribution,
} from '../utils/portfolio'
import { CACHE_STALE_TIME_STATIC, CACHE_STALE_TIME_FAST } from '../constants'

export default function Portfolio() {
  // 전체 종목 목록 조회
  const { data: etfs, isLoading: etfsLoading, error: etfsError } = useQuery({
    queryKey: ['etfs'],
    queryFn: async () => {
      const response = await etfApi.getAll()
      return response.data
    },
    staleTime: CACHE_STALE_TIME_STATIC,
  })

  // 투자/관찰 분류
  const { invested, trackingOnly } = useMemo(() => classifyETFs(etfs), [etfs])

  // 배치 요약 데이터 (30일 가격)
  const { data: batchSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['batch-summary-portfolio', etfs?.map(e => e.ticker)],
    queryFn: async () => {
      if (!etfs || etfs.length === 0) return null
      const tickers = etfs.map(e => e.ticker)
      const response = await etfApi.getBatchSummary(tickers, 30, 1)
      return response.data.data
    },
    enabled: !!etfs && etfs.length > 0,
    staleTime: CACHE_STALE_TIME_FAST,
  })

  // 포트폴리오 계산
  const summary = useMemo(
    () => calculatePortfolioSummary(invested, batchSummary),
    [invested, batchSummary]
  )

  const allocation = useMemo(
    () => calculateAllocation(invested, batchSummary),
    [invested, batchSummary]
  )

  const trend = useMemo(
    () => calculateDailyPortfolioTrend(invested, batchSummary, summary.totalInvestment),
    [invested, batchSummary, summary.totalInvestment]
  )

  const contributions = useMemo(
    () => calculateContribution(invested, batchSummary, summary.totalInvestment),
    [invested, batchSummary, summary.totalInvestment]
  )

  // 분석 리포트 토글
  const [showAnalysisReport, setShowAnalysisReport] = useState(false)
  const [showAIReport, setShowAIReport] = useState(false)

  const isLoading = etfsLoading || summaryLoading

  if (isLoading) {
    return (
      <div className="animate-fadeIn">
        <PageHeader title="Portfolio" subtitle="포트폴리오 대시보드" />
        <div className="flex items-center justify-center min-h-[50vh]">
          <Spinner />
        </div>
      </div>
    )
  }

  if (etfsError) {
    return (
      <div className="animate-fadeIn">
        <PageHeader title="Portfolio" subtitle="포트폴리오 대시보드" />
        <ErrorFallback error={etfsError} />
      </div>
    )
  }

  if (invested.length === 0) {
    return (
      <div className="animate-fadeIn">
        <PageHeader title="Portfolio" subtitle="포트폴리오 대시보드" />
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center max-w-2xl mx-auto transition-colors">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
            투자 종목이 없습니다
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Settings에서 종목의 매입가와 보유 수량을 설정하면 포트폴리오 분석을 시작할 수 있습니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fadeIn">
      <PageHeader title="Portfolio" subtitle="포트폴리오 대시보드" />

      {/* 요약 카드 */}
      <PortfolioSummaryCards
        summary={summary}
        investedCount={invested.length}
        trackingCount={trackingOnly.length}
      />

      {/* 파이차트 + 추이차트 (2열) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <AllocationPieChart data={allocation} />
        <PortfolioTrendChart data={trend} />
      </div>

      {/* 기여도 테이블 */}
      <ContributionTable contributions={contributions} trackingETFs={trackingOnly} />

      {/* 포트폴리오 분석 리포트 토글 */}
      <div className="mt-6 mb-4">
        <button
          onClick={() => setShowAnalysisReport(v => !v)}
          className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all duration-200 ${
            showAnalysisReport
              ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="font-medium">
            {showAnalysisReport ? '분석 리포트 접기' : '포트폴리오 분석 리포트'}
          </span>
          {!showAnalysisReport && (
            <span className="text-xs opacity-60">(진단, 조정 제안, 종목 건강 점검)</span>
          )}
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${showAnalysisReport ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {showAnalysisReport && (
        <PortfolioAnalysisReport
          investedETFs={invested}
          trackingETFs={trackingOnly}
          batchSummary={batchSummary}
          allocation={allocation}
          contributions={contributions}
          summary={summary}
        />
      )}

      {/* AI 종합 투자보고서 토글 */}
      <div className="mt-6 mb-4">
        <button
          onClick={() => setShowAIReport(v => !v)}
          className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all duration-200 ${
            showAIReport
              ? 'border-purple-400 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="font-medium">
            {showAIReport ? 'AI 투자보고서 접기' : 'AI 종합 투자보고서'}
          </span>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${showAIReport ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {showAIReport && (
        <AIInvestmentReport
          investedETFs={invested}
          trackingETFs={trackingOnly}
          batchSummary={batchSummary}
        />
      )}
    </div>
  )
}
