import { useSettings } from '../../contexts/SettingsContext'

/**
 * 일반 설정 패널 컴포넌트
 * 자동 새로고침, 날짜 범위, 표시 옵션 등을 관리합니다.
 */
export default function GeneralSettingsPanel() {
  const { settings, updateSettings, resetSettings } = useSettings()

  // 새로고침 간격 옵션
  const refreshIntervals = [
    { label: '30초', value: 30000 },
    { label: '1분', value: 60000 },
    { label: '5분', value: 300000 },
    { label: '10분', value: 600000 },
  ]

  // 날짜 범위 옵션
  const dateRangeOptions = [
    { label: '7일', value: '7D' },
    { label: '1개월', value: '1M' },
    { label: '3개월', value: '3M' },
  ]

  // 새로고침 간격을 읽기 쉬운 텍스트로 변환
  const getIntervalLabel = (interval) => {
    const option = refreshIntervals.find((opt) => opt.value === interval)
    return option ? option.label : '30초'
  }

  // 자동 새로고침 토글 핸들러
  const handleAutoRefreshToggle = (enabled) => {
    updateSettings('autoRefresh.enabled', enabled)
  }

  // 새로고침 간격 변경 핸들러
  const handleIntervalChange = (interval) => {
    updateSettings('autoRefresh.interval', interval)
  }

  // 기본 날짜 범위 변경 핸들러
  const handleDateRangeChange = (range) => {
    updateSettings('defaultDateRange', range)
  }

  // 표시 옵션 토글 핸들러
  const handleDisplayToggle = (key, value) => {
    updateSettings(`display.${key}`, value)
  }

  // 테마 변경 핸들러
  const handleThemeChange = (theme) => {
    updateSettings('theme', theme)
  }

  // 기본값으로 초기화 핸들러 (일반 설정 + 대시보드 카드 순서만 초기화, 종목/API/데이터는 유지)
  const handleReset = () => {
    if (window.confirm('일반 설정(테마, 자동 갱신, 기본 날짜 범위, 표시 옵션, 대시보드 카드 순서)을 기본값으로 초기화합니다. 종목·API 키·데이터는 변경되지 않습니다. 계속하시겠습니까?')) {
      resetSettings()
    }
  }

  // 테마 옵션
  const themeOptions = [
    { label: '라이트', value: 'light', icon: '☀️' },
    { label: '다크', value: 'dark', icon: '🌙' },
    { label: '시스템 설정 따르기', value: 'system', icon: '💻' },
  ]

  // 현재 테마 표시 텍스트
  const getCurrentThemeLabel = () => {
    const option = themeOptions.find((opt) => opt.value === settings.theme)
    return option ? option.label : '라이트'
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900">
      {/* 헤더 */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">일반 설정</h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
              대시보드 및 상세 페이지 동작 설정
            </p>
          </div>
          <button
            onClick={handleReset}
            className="w-full sm:w-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
            aria-label="설정 초기화"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            일반 설정 초기화
          </button>
        </div>
      </div>

      {/* 설정 내용 */}
      <div className="px-4 sm:px-6 py-6 space-y-8">
        {/* 자동 새로고침 설정 섹션 */}
        <section>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">자동 새로고침</h3>
          <div className="space-y-4">
            {/* 토글 스위치 */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  자동 새로고침 활성화
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  대시보드 데이터를 자동으로 갱신합니다
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoRefresh.enabled}
                  onChange={(e) => handleAutoRefreshToggle(e.target.checked)}
                  className="sr-only peer"
                  aria-label="자동 새로고침 활성화"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>

            {/* 새로고침 간격 선택 */}
            {settings.autoRefresh.enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  새로고침 간격
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {refreshIntervals.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleIntervalChange(option.value)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                        settings.autoRefresh.interval === option.value
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      aria-label={`${option.label} 간격 선택`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  현재 설정: <span className="font-medium text-gray-700">
                    자동 갱신: {getIntervalLabel(settings.autoRefresh.interval)}마다
                  </span>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 기본 날짜 범위 설정 섹션 */}
        <section className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">기본 날짜 범위</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Detail 페이지에서 기본으로 표시할 날짜 범위
            </label>
            <select
              value={settings.defaultDateRange}
              onChange={(e) => handleDateRangeChange(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              aria-label="기본 날짜 범위 선택"
            >
              {dateRangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              사용자가 수동으로 날짜 범위를 변경할 수 있습니다
            </p>
          </div>
        </section>

        {/* 표시 옵션 섹션 */}
        <section className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">표시 옵션</h3>
          <div className="space-y-4">
            {/* 거래량 표시 */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  거래량 표시
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  차트에서 거래량을 표시합니다
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.display.showVolume}
                  onChange={(e) => handleDisplayToggle('showVolume', e.target.checked)}
                  className="sr-only peer"
                  aria-label="거래량 표시"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>

            {/* 매매 동향 표시 */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  매매 동향 표시
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  종목 상세에서 고급 분석을 펼쳤을 때 투자자별 매매동향 차트를 표시합니다
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.display.showTradingFlow}
                  onChange={(e) => handleDisplayToggle('showTradingFlow', e.target.checked)}
                  className="sr-only peer"
                  aria-label="매매 동향 표시"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>

          </div>
        </section>

        {/* 테마 설정 섹션 */}
        <section className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">테마 설정</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              색상 테마 선택
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleThemeChange(option.value)}
                  className={`px-4 py-3 rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-2 ${
                    settings.theme === option.value
                      ? 'bg-primary-500 text-white dark:bg-primary-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  aria-label={`${option.label} 테마 선택`}
                >
                  <span className="text-lg">{option.icon}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              현재 설정: <span className="font-medium text-gray-700 dark:text-gray-300">
                {getCurrentThemeLabel()}
              </span>
              {settings.theme === 'system' && (
                <span className="ml-2 text-gray-400 dark:text-gray-500">
                  (시스템: {window.matchMedia('(prefers-color-scheme: dark)').matches ? '다크' : '라이트'})
                </span>
              )}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

