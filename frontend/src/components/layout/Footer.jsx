import { useQuery } from '@tanstack/react-query'
import { dataApi } from '../../services/api'

export default function Footer() {
  // 스케줄러 상태 조회 (마지막 수집 시각)
  const { data: schedulerStatus } = useQuery({
    queryKey: ['scheduler-status'],
    queryFn: async () => {
      const response = await dataApi.getSchedulerStatus()
      return response.data.scheduler
    },
    refetchInterval: 30000, // 30초마다 스케줄러 상태 갱신
    retry: 1,
  })

  const formatUpdateTime = (dateStr) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  return (
    <footer className="bg-gray-800 text-white py-8 mt-auto" role="contentinfo">
      <div className="container mx-auto px-4">
        {/* 주요 정보 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* 서비스 정보 */}
          <div>
            <h3 className="text-lg font-semibold mb-3">K-Growth Insights</h3>
            <p className="text-sm text-gray-400">
              한국 고성장 섹터 종목에 대한 종합분석 및 리포팅 서비스
            </p>
          </div>

          {/* 데이터 출처 */}
          <div>
            <h3 className="text-lg font-semibold mb-3">데이터 출처</h3>
            <ul className="text-sm text-gray-400 space-y-1" role="list">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>가격 데이터: Naver Finance</span>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>매매 동향: Naver Finance</span>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>뉴스 데이터: Naver News</span>
              </li>
            </ul>
          </div>

          {/* 업데이트 정보 */}
          <div>
            <h3 className="text-lg font-semibold mb-3">업데이트 정보</h3>
            <div className="text-sm text-gray-400 space-y-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>마지막 업데이트:</span>
              </div>
              <p className="pl-6 text-gray-300">{formatUpdateTime(schedulerStatus?.last_collection_time)}</p>
              <a
                href="https://github.com/kangsuek/ETFWeeklyReport"
                target="_blank"
                rel="noopener noreferrer"
                className="link inline-flex items-center gap-2 text-blue-400 hover:text-blue-300"
                aria-label="GitHub 저장소로 이동 (새 창)"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub 저장소
              </a>
            </div>
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t border-gray-700 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            {/* 저작권 */}
            <p className="text-sm text-gray-400">
              &copy; 2025 K-Growth Insights. All rights reserved.
            </p>

            {/* 면책 조항 */}
            <p className="text-xs text-gray-500 text-center md:text-right">
              본 정보는 투자 참고용이며, 투자 권유가 아닙니다. 투자 결정은 본인의 책임입니다.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
