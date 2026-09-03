import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { settingsApi } from '../../services/api'
import { useToast } from '../../contexts/ToastContext'
import { MIN_SEARCH_LENGTH } from '../../constants'

// 티커 코드 / 종목명 입력의 자동완성 드롭다운 (두 입력에서 공유)
function StockSuggestions({ innerRef, isSearching, results, onSelect }) {
  return (
    <div
      ref={innerRef}
      className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto"
    >
      {isSearching ? (
        <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
          검색 중...
        </div>
      ) : results.length > 0 ? (
        <ul className="py-1">
          {results.map((stock) => (
            <li
              key={stock.ticker}
              onClick={() => onSelect(stock)}
              className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {stock.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {stock.ticker} · {stock.market} · {stock.type}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
          검색 결과가 없습니다
        </div>
      )}
    </div>
  )
}

StockSuggestions.propTypes = {
  innerRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]),
  isSearching: PropTypes.bool,
  results: PropTypes.array.isRequired,
  onSelect: PropTypes.func.isRequired,
}

export default function TickerForm({ mode, initialData, prefillData, onSubmit, onClose, isSubmitting }) {
  const toast = useToast()
  const [formData, setFormData] = useState({
    ticker: '',
    name: '',
    type: 'ALL',
    theme: '',
    search_keyword: '',
    relevance_keywords: [],
  })

  const [keywordsInput, setKeywordsInput] = useState('')
  const [errors, setErrors] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchField, setSearchField] = useState(null) // 'ticker' or 'name'
  const tickerInputRef = useRef(null)
  const nameInputRef = useRef(null)
  const suggestionsRef = useRef(null)

  // 스크리닝에서 전달된 프리필 데이터 (생성 모드)
  useEffect(() => {
    if (mode === 'create' && prefillData) {
      setFormData((prev) => ({
        ...prev,
        ticker: prefillData.ticker || '',
        name: prefillData.name || '',
        type: prefillData.type || 'ETF',
        theme: prefillData.theme || '',
      }))
    }
  }, [mode, prefillData])

  // 초기 데이터 설정 (수정 모드)
  useEffect(() => {
    if (mode === 'edit' && initialData) {
      setFormData({
        ticker: initialData.ticker || '',
        name: initialData.name || '',
        type: initialData.type || 'ALL',
        theme: initialData.theme || '',
        search_keyword: initialData.search_keyword || '',
        relevance_keywords: initialData.relevance_keywords || [],
      })
      setKeywordsInput((initialData.relevance_keywords || []).join(', '))
    }
  }, [mode, initialData])

  // 종목 검색 (자동완성) - 티커 코드 또는 종목명으로 검색
  // 'ALL'이면 타입 필터 없이 모든 종목 검색
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['stockSearch', searchQuery, formData.type],
    queryFn: async () => {
      if (searchQuery.length < MIN_SEARCH_LENGTH) return []
      // 'ALL'이면 null을 전달하여 모든 타입 검색
      const typeFilter = formData.type === 'ALL' ? null : formData.type
      const response = await settingsApi.searchStocks(searchQuery, typeFilter)
      return response.data
    },
    enabled: searchQuery.length >= MIN_SEARCH_LENGTH && mode === 'create' && searchField !== null,
    staleTime: 30000, // 30초간 캐시
  })

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target) &&
        tickerInputRef.current &&
        !tickerInputRef.current.contains(event.target) &&
        nameInputRef.current &&
        !nameInputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // 네이버 금융 자동 입력 Mutation
  const validateMutation = useMutation({
    mutationFn: (ticker) => settingsApi.validateTicker(ticker),
    onSuccess: (response) => {
      const data = response.data
      // 함수형 업데이터 사용: 네트워크 응답 대기 중 사용자가 다른 필드를 수정했다면
      // 그 수정 내용이 남아있도록 최신 상태 위에 덮어써야 한다 (stale closure 방지)
      setFormData((prev) => ({
        ...prev,
        name: data.name || '',
        type: data.type || 'ALL',
        theme: data.theme || '',
        search_keyword: data.search_keyword || '',
        relevance_keywords: data.relevance_keywords || [],
      }))
      setKeywordsInput((data.relevance_keywords || []).join(', '))
      toast.success('종목 정보를 자동으로 입력했습니다. 확인 후 저장하세요.', 3000)
    },
    onError: (error) => {
      toast.error(`종목 정보를 가져올 수 없습니다: ${error.message}`, 3000)
    },
  })

  const handleAutoFill = () => {
    if (!formData.ticker) {
      toast.warning('티커 코드를 먼저 입력하세요.', 2000)
      return
    }
    validateMutation.mutate(formData.ticker)
  }

  const handleChange = (e) => {
    const { name, value } = e.target

    setFormData(prev => ({ ...prev, [name]: value }))
    // 에러 클리어
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }))
    }

    // 티커 코드 또는 종목명 입력 시 검색 쿼리 업데이트 및 자동완성
    if ((name === 'ticker' || name === 'name') && mode === 'create') {
      setSearchQuery(value)
      setSearchField(name)
      setShowSuggestions(value.length >= MIN_SEARCH_LENGTH)
    }
  }

  // 자동완성에서 종목 선택
  const handleSelectStock = (stock) => {
    setFormData(prev => ({
      ...prev,
      ticker: stock.ticker,
      name: stock.name,
      type: stock.type,
    }))
    setSearchQuery('')
    setShowSuggestions(false)
    setSearchField(null)
  }

  // Debounce를 위한 자동 검색 (티커 코드가 6자리 이상일 때)
  useEffect(() => {
    if (mode === 'create' && formData.ticker && formData.ticker.length >= 6 && !formData.name) {
      const timer = setTimeout(() => {
        if (formData.ticker) {
          validateMutation.mutate(formData.ticker)
        }
      }, 800) // 800ms 후 자동 실행

      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.ticker, formData.name, mode])

  const handleKeywordsChange = (e) => {
    const value = e.target.value
    setKeywordsInput(value)
    // 쉼표로 분리하여 배열로 변환
    const keywords = value
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
    setFormData(prev => ({ ...prev, relevance_keywords: keywords }))
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.ticker) newErrors.ticker = '티커 코드는 필수입니다.'
    if (!formData.name) newErrors.name = '종목명은 필수입니다.'
    if (!formData.type) newErrors.type = '타입은 필수입니다.'
    // theme is now optional

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    // 제출 데이터 준비
    const submitData = { ...formData }

    // 비운 선택 필드는 빈 문자열 대신 null로 보낸다. 백엔드는 null을 "지우기"로
    // 해석해 컬럼을 NULL로 만든다(빈 문자열이 그대로 저장되는 것을 막는다).
    for (const key of ['theme', 'search_keyword']) {
      if (typeof submitData[key] === 'string' && submitData[key].trim() === '') {
        submitData[key] = null
      }
    }

    onSubmit(submitData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto transition-colors">
        {/* 헤더 */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 rounded-t-lg z-10 transition-colors">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
            {mode === 'create' ? '새 종목 추가' : '종목 수정'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
            disabled={isSubmitting}
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
          {/* 티커 코드 + 자동 입력 버튼 */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              티커 코드 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <input
                  ref={tickerInputRef}
                  type="text"
                  name="ticker"
                  value={formData.ticker}
                  onChange={handleChange}
                  onFocus={() => {
                    if (formData.ticker.length >= MIN_SEARCH_LENGTH) {
                      setSearchQuery(formData.ticker)
                      setSearchField('ticker')
                      setShowSuggestions(true)
                    }
                  }}
                  disabled={mode === 'edit' || isSubmitting}
                  className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="티커 코드 또는 종목명 검색"
                />
                {/* 자동완성 드롭다운 (티커 코드 필드용) */}
                {mode === 'create' && showSuggestions && searchQuery.length >= MIN_SEARCH_LENGTH && searchField === 'ticker' && (
                  <StockSuggestions
                    innerRef={suggestionsRef}
                    isSearching={isSearching}
                    results={searchResults}
                    onSelect={handleSelectStock}
                  />
                )}
              </div>
              {mode === 'create' && (
                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={!formData.ticker || validateMutation.isPending || isSubmitting}
                  className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  {validateMutation.isPending ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      로딩 중...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span className="hidden sm:inline">네이버에서 자동 입력</span>
                      <span className="sm:hidden">자동 입력</span>
                    </>
                  )}
                </button>
              )}
            </div>
            {errors.ticker && <p className="text-red-500 text-xs sm:text-sm mt-1">{errors.ticker}</p>}
            {mode === 'create' && (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                티커 코드 또는 종목명을 입력하면 자동완성이 표시됩니다. 6자리 티커 코드 입력 시 자동으로 정보를 가져옵니다.
              </p>
            )}
          </div>

          {/* 종목명 */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              종목명 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                ref={nameInputRef}
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onFocus={() => {
                  if (formData.name.length >= MIN_SEARCH_LENGTH) {
                    setSearchQuery(formData.name)
                    setSearchField('name')
                    setShowSuggestions(true)
                  }
                }}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="종목명을 입력하거나 검색하세요"
              />
              {/* 자동완성 드롭다운 (종목명 필드용) */}
              {mode === 'create' && showSuggestions && searchQuery.length >= MIN_SEARCH_LENGTH && searchField === 'name' && (
                <StockSuggestions
                  innerRef={suggestionsRef}
                  isSearching={isSearching}
                  results={searchResults}
                  onSelect={handleSelectStock}
                />
              )}
            </div>
            {errors.name && <p className="text-red-500 dark:text-red-400 text-sm mt-1">{errors.name}</p>}
            {mode === 'create' && (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                종목명을 입력하면 자동완성이 표시됩니다. 종목을 선택하면 티커 코드가 자동으로 입력됩니다.
              </p>
            )}
          </div>

          {/* 타입 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              타입 <span className="text-red-500">*</span>
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="ALL">ALL (전체)</option>
              <option value="ETF">ETF</option>
              <option value="STOCK">STOCK</option>
            </select>
            {errors.type && <p className="text-red-500 dark:text-red-400 text-sm mt-1">{errors.type}</p>}
          </div>

          {/* 테마 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              테마
            </label>
            <input
              type="text"
              name="theme"
              value={formData.theme}
              onChange={handleChange}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="예: 2차전지, 반도체, AI (선택사항)"
            />
            {errors.theme && <p className="text-red-500 dark:text-red-400 text-sm mt-1">{errors.theme}</p>}
          </div>

          {/* 매입 정보 안내 */}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            매입가·보유수량은 종목 추가 후 목록의 &quot;거래내역&quot; 버튼에서
            매수/매도 내역으로 관리합니다.
          </p>

          {/* 뉴스 검색 키워드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              뉴스 검색 키워드
            </label>
            <input
              type="text"
              name="search_keyword"
              value={formData.search_keyword}
              onChange={handleChange}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="예: 삼성전자"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              뉴스 수집 시 사용할 검색 키워드입니다.
            </p>
          </div>

          {/* 관련 키워드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              관련 키워드
            </label>
            <input
              type="text"
              value={keywordsInput}
              onChange={handleKeywordsChange}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="쉼표로 구분하여 입력 (예: 삼성전자, 반도체, 전자)"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              뉴스 관련성 판단에 사용할 키워드들을 쉼표로 구분하여 입력하세요.
            </p>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  저장 중...
                </>
              ) : (
                mode === 'create' ? '추가' : '수정'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
