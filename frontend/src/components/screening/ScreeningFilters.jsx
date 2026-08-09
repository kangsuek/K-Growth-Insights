import { useState, useEffect } from 'react'

const MARKET_TABS = [
  { value: 'ETF', label: 'ETF' },
  { value: 'KOSPI', label: 'KOSPI' },
  { value: 'KOSDAQ', label: 'KOSDAQ' },
  { value: 'ALL', label: '전체' },
]

/**
 * '+만 보기' 토글 목록. 각 항목은 해당 값이 0보다 큰 종목만 남긴다.
 *
 * 최소%(min_*) 입력은 `>= 0`이라 보합(0)도 걸리므로 토글을 따로 둔다.
 * 값이 없는(미수집) 종목도 제외된다.
 */
export const POSITIVE_TOGGLES = [
  { key: 'daily_change_positive', label: '등락률 +' },
  { key: 'weekly_return_positive', label: '주간 +' },
  { key: 'monthly_return_positive', label: '월간 +' },
  { key: 'ytd_return_positive', label: '연간 +' },
  { key: 'foreign_net_positive', label: '외국인 순매수' },
  { key: 'institutional_net_positive', label: '기관 순매수' },
]

// '모두 상승' 버튼: 등락률·주간·월간·연간을 한 번에 켠다(수급 토글은 건드리지 않는다).
export const ALL_RISING_FILTER = {
  daily_change_positive: true,
  weekly_return_positive: true,
  monthly_return_positive: true,
  ytd_return_positive: true,
}

const formatAt = (iso) => new Date(iso).toLocaleString('ko-KR')

/**
 * 데이터 갱신 시각 문구.
 *
 * 현재가·등락률·거래량(시세)과 수익률·수급(지표)은 서로 다른 수집 단계가 채운다.
 * 한쪽만 다시 돌면 한 행 안에서 기준 시점이 어긋나므로, 시각이 다르면 둘을 나눠 적어
 * 어느 쪽이 오래됐는지 드러낸다. 같은 분에 수집됐으면 한 줄로 합친다.
 */
export function formatDataFreshness(priceUpdatedAt, metricsUpdatedAt) {
  if (!priceUpdatedAt && !metricsUpdatedAt) return null
  if (!priceUpdatedAt) return `데이터 갱신: ${formatAt(metricsUpdatedAt)}`
  if (!metricsUpdatedAt) return `데이터 갱신: ${formatAt(priceUpdatedAt)}`

  // 초 단위 차이는 같은 수집으로 본다.
  const sameMinute =
    Math.abs(new Date(priceUpdatedAt) - new Date(metricsUpdatedAt)) < 60_000
  if (sameMinute) return `데이터 갱신: ${formatAt(metricsUpdatedAt)}`

  return `데이터 갱신: 시세 ${formatAt(priceUpdatedAt)} · 지표 ${formatAt(metricsUpdatedAt)}`
}

export default function ScreeningFilters({ filters, onFilterChange, onReset, lastUpdated, priceUpdatedAt }) {
  const [localQ, setLocalQ] = useState(filters.q || '')
  const [localMinWR, setLocalMinWR] = useState(filters.min_weekly_return ?? '')
  const [localMaxWR, setLocalMaxWR] = useState(filters.max_weekly_return ?? '')
  const [localMinMR, setLocalMinMR] = useState(filters.min_monthly_return ?? '')
  const [localMaxMR, setLocalMaxMR] = useState(filters.max_monthly_return ?? '')
  const [localMinYR, setLocalMinYR] = useState(filters.min_ytd_return ?? '')
  const [localMaxYR, setLocalMaxYR] = useState(filters.max_ytd_return ?? '')

  // 외부에서 filters가 리셋될 때 로컬 상태도 동기화
  useEffect(() => {
    setLocalQ(filters.q || '')
    setLocalMinWR(filters.min_weekly_return ?? '')
    setLocalMaxWR(filters.max_weekly_return ?? '')
    setLocalMinMR(filters.min_monthly_return ?? '')
    setLocalMaxMR(filters.max_monthly_return ?? '')
    setLocalMinYR(filters.min_ytd_return ?? '')
    setLocalMaxYR(filters.max_ytd_return ?? '')
  }, [filters])

  const handleSearch = (e) => {
    e.preventDefault()
    const minWR = localMinWR !== '' ? parseFloat(localMinWR) : undefined
    const maxWR = localMaxWR !== '' ? parseFloat(localMaxWR) : undefined
    const minMR = localMinMR !== '' ? parseFloat(localMinMR) : undefined
    const maxMR = localMaxMR !== '' ? parseFloat(localMaxMR) : undefined
    const minYR = localMinYR !== '' ? parseFloat(localMinYR) : undefined
    const maxYR = localMaxYR !== '' ? parseFloat(localMaxYR) : undefined
    
    onFilterChange({
      q: localQ || undefined,
      min_weekly_return: minWR !== undefined && !isNaN(minWR) ? minWR : undefined,
      max_weekly_return: maxWR !== undefined && !isNaN(maxWR) ? maxWR : undefined,
      min_monthly_return: minMR !== undefined && !isNaN(minMR) ? minMR : undefined,
      max_monthly_return: maxMR !== undefined && !isNaN(maxMR) ? maxMR : undefined,
      min_ytd_return: minYR !== undefined && !isNaN(minYR) ? minYR : undefined,
      max_ytd_return: maxYR !== undefined && !isNaN(maxYR) ? maxYR : undefined,
    })
  }

  const handleReset = () => {
    setLocalQ('')
    setLocalMinWR('')
    setLocalMaxWR('')
    setLocalMinMR('')
    setLocalMaxMR('')
    setLocalMinYR('')
    setLocalMaxYR('')
    onReset()
  }

  const applyNumberFilter = (key, value) => {
    const str = value !== undefined && value !== null ? String(value).trim() : ''
    const parsed = str !== '' ? parseFloat(str) : undefined
    if (str !== '' && isNaN(parsed)) return // NaN 무시

    if (key === 'min_weekly_return') setLocalMinWR(str === '' ? '' : parsed)
    if (key === 'max_weekly_return') setLocalMaxWR(str === '' ? '' : parsed)
    if (key === 'min_monthly_return') setLocalMinMR(str === '' ? '' : parsed)
    if (key === 'max_monthly_return') setLocalMaxMR(str === '' ? '' : parsed)
    if (key === 'min_ytd_return') setLocalMinYR(str === '' ? '' : parsed)
    if (key === 'max_ytd_return') setLocalMaxYR(str === '' ? '' : parsed)
    // 검색 버튼(handleSearch)으로만 API 호출 — blur 시 중복 호출 방지 (FIX-07)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4 transition-colors">
      <form onSubmit={handleSearch} className="space-y-4">
        {/* 시장 탭 */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">시장</label>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 w-fit">
            {MARKET_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => onFilterChange({ market: tab.value })}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  (filters.market || 'ETF') === tab.value
                    ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 검색 입력 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            종목 검색
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
              placeholder="종목명 또는 코드 입력..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
            <button type="submit" className="btn btn-primary btn-sm">
              검색
            </button>
          </div>
        </div>

        {/* 필터 행 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 주간수익률 범위 */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">주간 (최소 %)</label>
            <input
              type="number"
              step="0.1"
              value={localMinWR}
              onChange={(e) => setLocalMinWR(e.target.value)}
              onBlur={(e) => applyNumberFilter('min_weekly_return', e.target.value)}
              placeholder="최소 %"
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">주간 (최대 %)</label>
            <input
              type="number"
              step="0.1"
              value={localMaxWR}
              onChange={(e) => setLocalMaxWR(e.target.value)}
              onBlur={(e) => applyNumberFilter('max_weekly_return', e.target.value)}
              placeholder="최대 %"
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>

          {/* 월간수익률 범위 */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">월간 (최소 %)</label>
            <input
              type="number"
              step="0.1"
              value={localMinMR}
              onChange={(e) => setLocalMinMR(e.target.value)}
              onBlur={(e) => applyNumberFilter('min_monthly_return', e.target.value)}
              placeholder="최소 %"
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">월간 (최대 %)</label>
            <input
              type="number"
              step="0.1"
              value={localMaxMR}
              onChange={(e) => setLocalMaxMR(e.target.value)}
              onBlur={(e) => applyNumberFilter('max_monthly_return', e.target.value)}
              placeholder="최대 %"
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>

          {/* 연간수익률 범위 */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">연간 (최소 %)</label>
            <input
              type="number"
              step="0.1"
              value={localMinYR}
              onChange={(e) => setLocalMinYR(e.target.value)}
              onBlur={(e) => applyNumberFilter('min_ytd_return', e.target.value)}
              placeholder="최소 %"
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">연간 (최대 %)</label>
            <input
              type="number"
              step="0.1"
              value={localMaxYR}
              onChange={(e) => setLocalMaxYR(e.target.value)}
              onBlur={(e) => applyNumberFilter('max_ytd_return', e.target.value)}
              placeholder="최대 %"
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
          </div>

          {/* 토글 행 (별도 div로 분리하여 한 줄에 표시) */}
          <div className="lg:col-span-6 flex flex-wrap items-center gap-x-4 gap-y-2 mt-1">
            {POSITIVE_TOGGLES.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!filters[key]}
                  onChange={(e) => onFilterChange({ [key]: e.target.checked ? true : undefined })}
                  className="w-4 h-4 text-primary-500 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
            <button
              type="button"
              onClick={() => onFilterChange(ALL_RISING_FILTER)}
              className="btn btn-outline btn-sm text-primary-600 dark:text-primary-400"
            >
              모두 상승
            </button>
            <label
              className="flex items-center gap-2 cursor-pointer"
              title={'연초 이후 꾸준히 오른 종목만 봅니다.\n'
                + '연초대비 수익률만 보면 폭락 후 반등도 +로 잡히므로, 추세의 직선성(R²)·'
                + '최대 낙폭·월별 승률·20일선 유지를 함께 봅니다.\n'
                + '연 1~2%짜리 머니마켓·단기채권 ETF는 제외됩니다.'}
            >
              <input
                type="checkbox"
                checked={!!filters.sustained_uptrend}
                onChange={(e) => onFilterChange({ sustained_uptrend: e.target.checked ? true : undefined })}
                className="w-4 h-4 text-primary-500 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                지속 상승추세
              </span>
            </label>
          </div>
        </div>

        {/* 하단: 초기화 + 갱신 시각 */}
        <div className="flex items-center justify-between">
          <button type="button" onClick={handleReset} className="btn btn-outline btn-sm text-gray-500">
            초기화
          </button>
          {formatDataFreshness(priceUpdatedAt, lastUpdated) && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-100">
              <span aria-hidden="true">🕒</span>
              {formatDataFreshness(priceUpdatedAt, lastUpdated)}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
