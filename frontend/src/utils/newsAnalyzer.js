/**
 * 뉴스 분석 유틸리티
 *
 * 키워드 기반으로 뉴스의 센티먼트와 주요 토픽을 분석합니다.
 * AI API 없이 규칙 기반으로 동작합니다.
 */

// 센티먼트 키워드 정의
const SENTIMENT_KEYWORDS = {
  positive: [
    '급등', '상승', '호재', '실적개선', '수주', '신고가', '돌파',
    '상향', '호황', '반등', '성장', '확대', '증가', '개선',
    '기대감', '강세', '최대', '흑자', '회복', '주목'
  ],
  negative: [
    '급락', '하락', '악재', '실적부진', '규제', '리스크', '우려',
    '하향', '불황', '위축', '감소', '악화', '폭락', '조정',
    '불안', '약세', '적자', '손실', '위기', '충격'
  ]
}

// 토픽 키워드 정의
const TOPIC_KEYWORDS = {
  '정책': ['규제', '관세', '정책', '제재', '법안', '정부', '금지', '승인', '조치'],
  '업황': ['수요', '출하량', '가격', '반등', '전망', '사이클', '업황', '시황', '수급'],
  '실적': ['실적', '매출', '영업이익', '분기', '예상치', '순이익', '성장률', '어닝'],
  '기업': ['삼성', 'SK', '하이닉스', '인수', '합병', '투자', '신규', '설비', '증설'],
  '금리': ['금리', '인상', '인하', '연준', '기준금리', 'Fed', '통화정책'],
  '환율': ['환율', '달러', '원화', '엔화', '강세', '약세', '외환']
}

/**
 * 텍스트에서 키워드 출현 횟수 계산
 * @param {string} text - 검색 대상 텍스트
 * @param {Array} keywords - 검색할 키워드 배열
 * @returns {number} 키워드 출현 횟수
 */
function countKeywords(text, keywords) {
  if (!text || !keywords) return 0
  return keywords.reduce((count, keyword) => {
    const regex = new RegExp(keyword, 'gi')
    const matches = text.match(regex)
    return count + (matches ? matches.length : 0)
  }, 0)
}

/**
 * 개별 뉴스 센티먼트 분석
 * @param {string} title - 뉴스 제목
 * @returns {string} 'positive' | 'negative' | 'neutral'
 */
export function analyzeNewsSentiment(title) {
  if (!title) return 'neutral'

  const positiveCount = countKeywords(title, SENTIMENT_KEYWORDS.positive)
  const negativeCount = countKeywords(title, SENTIMENT_KEYWORDS.negative)

  if (positiveCount > negativeCount) return 'positive'
  if (negativeCount > positiveCount) return 'negative'
  return 'neutral'
}

/**
 * 개별 뉴스 토픽 태그 추출
 * @param {string} title - 뉴스 제목
 * @returns {Array} 토픽 태그 배열 (최대 2개)
 */
export function extractNewsTags(title) {
  if (!title) return []

  const topicCounts = Object.entries(TOPIC_KEYWORDS)
    .map(([topic, keywords]) => ({
      topic,
      count: countKeywords(title, keywords)
    }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map(t => t.topic)

  return topicCounts
}

/**
 * 뉴스 목록 전체 분석
 * @param {Array} newsList - 뉴스 배열 [{title, ...}, ...]
 * @returns {Object} { sentiment, topics, summary, analyzedNews }
 */
export function analyzeNewsList(newsList) {
  if (!newsList || newsList.length === 0) {
    return {
      sentiment: 'neutral',
      topics: [],
      summary: null,
      analyzedNews: []
    }
  }

  // 모든 뉴스 제목 합치기
  const allTitles = newsList.map(n => n.title).join(' ')

  // 전체 센티먼트 분석
  const positiveCount = countKeywords(allTitles, SENTIMENT_KEYWORDS.positive)
  const negativeCount = countKeywords(allTitles, SENTIMENT_KEYWORDS.negative)

  let overallSentiment = 'neutral'
  if (positiveCount > negativeCount + 2) overallSentiment = 'positive'
  if (negativeCount > positiveCount + 2) overallSentiment = 'negative'

  // 주요 토픽 추출
  const topics = Object.entries(TOPIC_KEYWORDS)
    .map(([topic, keywords]) => ({
      topic,
      count: countKeywords(allTitles, keywords)
    }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(t => t.topic)

  // 개별 뉴스 분석
  const analyzedNews = newsList.map(news => ({
    ...news,
    sentiment: analyzeNewsSentiment(news.title),
    tags: extractNewsTags(news.title)
  }))

  // 요약 문장 생성
  const summary = generateSummary(topics, overallSentiment, newsList.length)

  return {
    sentiment: overallSentiment,
    topics,
    summary,
    analyzedNews
  }
}

/**
 * 뉴스 요약 문장 생성
 * @param {Array} topics - 주요 토픽 배열
 * @param {string} sentiment - 전체 센티먼트
 * @param {number} count - 뉴스 개수
 * @returns {string|null} 요약 문장
 */
function generateSummary(topics, sentiment, count) {
  if (topics.length === 0) return null

  const sentimentText = {
    positive: '긍정적인',
    negative: '부정적인',
    neutral: ''
  }[sentiment]

  const topicsText = topics.join(', ')

  if (sentimentText) {
    return `최근 ${count}건의 뉴스는 ${topicsText} 관련 ${sentimentText} 소식에 집중되어 있습니다.`
  }
  return `최근 ${count}건의 뉴스는 ${topicsText} 관련 소식이 주를 이루고 있습니다.`
}

/**
 * 센티먼트별 스타일 반환
 * @param {string} sentiment - 'positive' | 'negative' | 'neutral'
 * @returns {Object} { icon, color, label, bgColor }
 */
export function getSentimentStyle(sentiment) {
  const styles = {
    positive: {
      icon: '📈',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      label: '호재'
    },
    negative: {
      icon: '📉',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      label: '악재'
    },
    neutral: {
      icon: '➖',
      color: 'text-gray-500 dark:text-gray-400',
      bgColor: 'bg-gray-50 dark:bg-gray-800',
      label: '중립'
    }
  }

  return styles[sentiment] || styles.neutral
}
