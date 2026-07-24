import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import PropTypes from 'prop-types'
import { newsApi } from '../../services/api'
import { analyzeNewsList, getSentimentStyle } from '../../utils/newsAnalyzer'

/**
 * 센티먼트 아이콘 컴포넌트
 */
const SentimentBadge = ({ sentiment }) => {
  const style = getSentimentStyle(sentiment)

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${style.bgColor} ${style.color}`}>
      <span>{style.icon}</span>
      <span>{style.label}</span>
    </span>
  )
}

SentimentBadge.propTypes = {
  sentiment: PropTypes.oneOf(['positive', 'negative', 'neutral']).isRequired
}

/**
 * 토픽 태그 컴포넌트
 */
const TopicTag = ({ topic }) => (
  <span className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
    #{topic}
  </span>
)

TopicTag.propTypes = {
  topic: PropTypes.string.isRequired
}

/**
 * NewsTimeline 컴포넌트
 * 종목 관련 뉴스를 타임라인 형태로 표시
 * 센티먼트 분석 및 요약 기능 포함
 *
 * @param {string} ticker - 종목 티커
 * @param {Object} newsData - 뉴스 데이터 (props로 전달 시 API 호출 생략)
 * @param {boolean} isLoading - 로딩 상태
 * @param {Error} error - 에러 객체
 */
const NewsTimeline = ({ ticker, newsData, isLoading, error }) => {
  const [limit] = useState(10)
  // 일자별 접힘 상태 관리 (기본: 첫 번째 날짜만 펼침)
  const [expandedDates, setExpandedDates] = useState({})

  // props로 데이터가 전달되지 않은 경우에만 API 호출 (하위 호환성)
  const { data: fallbackData, isLoading: fallbackLoading, error: fallbackError } = useQuery({
    queryKey: ['news', ticker, limit],
    queryFn: async () => {
      const response = await newsApi.getByTicker(ticker, { days: 7, limit, analyze: true })
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5분
    enabled: !newsData, // props로 데이터가 전달된 경우 비활성화
  })

  // props 데이터 우선 사용, 없으면 fallback 사용
  const data = newsData || fallbackData
  const finalIsLoading = isLoading !== undefined ? isLoading : fallbackLoading
  const finalError = error || fallbackError

  // 백엔드 분석 결과 사용 (또는 프론트엔드 분석 fallback)
  const newsAnalysis = useMemo(() => {
    if (!data) return null
    
    // 백엔드 응답 형식: { news: [...], analysis: {...} }
    if (data.news && Array.isArray(data.news)) {
      // 백엔드에서 분석된 뉴스 사용
      return {
        analyzedNews: data.news,
        sentiment: data.analysis?.sentiment || 'neutral',
        topics: data.analysis?.topics || [],
        summary: data.analysis?.summary || null
      }
    }
    
    // 기존 형식 (배열)인 경우 프론트엔드 분석 사용 (하위 호환성)
    if (Array.isArray(data) && data.length > 0) {
      return analyzeNewsList(data)
    }
    
    return null
  }, [data])

  // 날짜별로 그룹핑 (분석된 뉴스 사용)
  const groupedNews = useMemo(() => {
    if (!newsAnalysis?.analyzedNews || newsAnalysis.analyzedNews.length === 0) return {}

    const groups = {}
    newsAnalysis.analyzedNews.forEach((news) => {
      // 날짜 유효성 검사 추가
      if (!news.date) return

      try {
        const date = new Date(news.date)
        // Invalid Date 체크
        if (isNaN(date.getTime())) return

        const dateKey = format(date, 'yyyy-MM-dd')
        if (!groups[dateKey]) {
          groups[dateKey] = []
        }
        groups[dateKey].push(news)
      } catch (e) {
        // Invalid date - skip this news item
      }
    })
    return groups
  }, [newsAnalysis])

  // 날짜 목록 (정렬된 순서)
  const sortedDates = useMemo(() => {
    return Object.keys(groupedNews).sort((a, b) => new Date(b) - new Date(a))
  }, [groupedNews])

  // 첫 번째 날짜는 기본적으로 펼침
  const isDateExpanded = (date) => {
    if (expandedDates[date] !== undefined) {
      return expandedDates[date]
    }
    // 기본값: 첫 번째 날짜만 펼침
    return sortedDates.length > 0 && sortedDates[0] === date
  }

  // 날짜 접기/펼치기 토글
  const toggleDate = (date) => {
    setExpandedDates(prev => ({
      ...prev,
      [date]: !isDateExpanded(date)
    }))
  }

  // 관련도 점수 색상 반환
  const getRelevanceColor = (score) => {
    if (score >= 0.8) return 'bg-green-500'
    if (score >= 0.5) return 'bg-yellow-500'
    return 'bg-gray-400'
  }

  if (finalIsLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-2"></div>
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    )
  }

  if (finalError) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>뉴스를 불러오는데 실패했습니다</p>
      </div>
    )
  }

  // 데이터 확인 (백엔드 응답 형식 또는 기존 형식)
  const newsList = data?.news || (Array.isArray(data) ? data : [])
  
  if (!newsList || newsList.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>최근 뉴스가 없습니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 뉴스 요약 코멘트 */}
      {newsAnalysis?.summary && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 border border-yellow-100 dark:border-yellow-800/30">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            💡 {newsAnalysis.summary}
          </p>
          {newsAnalysis.topics && newsAnalysis.topics.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {newsAnalysis.topics.map(topic => (
                <TopicTag key={topic} topic={topic} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 뉴스 타임라인 */}
      <div className="space-y-4">
        {sortedDates.map((date) => {
          const newsItems = groupedNews[date]
          const expanded = isDateExpanded(date)

          return (
            <div key={date} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {/* 날짜 헤더 (클릭 가능) */}
              <button
                onClick={() => toggleDate(date)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {format(new Date(date), 'yyyy년 MM월 dd일')}
                  </h4>
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded-full">
                    {newsItems.length}건
                  </span>
                </div>
                <span className="text-gray-400 dark:text-gray-500 text-sm">
                  {expanded ? '▲' : '▼'}
                </span>
              </button>

              {/* 뉴스 목록 (접힘/펼침) */}
              {expanded && (
                <div className="space-y-3 p-4 border-t border-gray-200 dark:border-gray-700">
                  {newsItems.map((news, index) => (
                    <div
                      key={news.url || `${news.date}-${index}`}
                      className="bg-white dark:bg-gray-800 rounded-lg p-4 hover:shadow-md transition-shadow border border-gray-100 dark:border-gray-700"
                    >
                      {/* 제목 */}
                      <a
                        href={news.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-base font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors block"
                      >
                        {news.title}
                      </a>

                      {/* 메타 정보: 출처, 발행 시각(또는 수집일 기준 시간) */}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{news.source}</span>
                        <span>•</span>
                        <span>
                          {(news.published_at || news.date) ? (() => {
                            try {
                              const d = new Date(news.published_at || news.date)
                              return isNaN(d.getTime()) ? '-' : format(d, 'HH:mm')
                            } catch {
                              return '-'
                            }
                          })() : '-'}
                        </span>

                        {/* 센티먼트 배지 */}
                        <span>•</span>
                        <SentimentBadge sentiment={news.sentiment || 'neutral'} />

                        {/* 토픽 태그 */}
                        {news.tags && news.tags.length > 0 && (
                          <>
                            <span>•</span>
                            {news.tags.map(tag => (
                              <TopicTag key={tag} topic={tag} />
                            ))}
                          </>
                        )}

                        {/* 관련도 (기존 유지) */}
                        {news.relevance_score && (
                          <>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                              <span>관련도</span>
                              <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${getRelevanceColor(news.relevance_score)}`}
                                  style={{ width: `${news.relevance_score * 100}%` }}
                                ></div>
                              </div>
                              <span>{(news.relevance_score * 100).toFixed(0)}%</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

NewsTimeline.propTypes = {
  ticker: PropTypes.string.isRequired,
  newsData: PropTypes.object,
  isLoading: PropTypes.bool,
  error: PropTypes.object,
}

export default NewsTimeline
