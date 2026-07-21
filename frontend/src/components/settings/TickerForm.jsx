import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { settingsApi } from '../../services/api'
import { MIN_SEARCH_LENGTH } from '../../constants'
import { formatPrice, formatNumber } from '../../utils/format'

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
  const [formData, setFormData] = useState({
    ticker: '',
    name: '',
    type: 'ALL',
    theme: '',
    purchase_date: '',
    purchase_price: '',
    quantity: '',
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
      // purchase_price와 quantity를 콤마 포맷팅된 문자열로 변환
      const formattedPurchasePrice = initialData.purchase_price 
        ? formatPrice(initialData.purchase_price) 
        : ''
      const formattedQuantity = initialData.quantity 
        ? formatNumber(initialData.quantity) 
        : ''
      
      setFormData({
        ticker: initialData.ticker || '',
        name: initialData.name || '',
        type: initialData.type || 'ALL',
        theme: initialData.theme || '',
        purchase_date: initialData.purchase_date ?? '', // null 또는 undefined인 경우 빈 문자열
        purchase_price: formattedPurchasePrice, // 콤마 포맷팅된 문자열
        quantity: formattedQuantity, // 콤마 포맷팅된 문자열
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
        purchase_date: data.purchase_date ?? '', // null 또는 undefined인 경우 빈 문자열
        purchase_price: data.purchase_price ?? '', // null 또는 undefined인 경우 빈 문자열
        search_keyword: data.search_keyword || '',
        relevance_keywords: data.relevance_keywords || [],
      }))
      setKeywordsInput((data.relevance_keywords || []).join(', '))
      alert('종목 정보를 자동으로 입력했습니다. 확인 후 저장하세요.')
    },
    onError: (error) => {
      alert(`종목 정보를 가져올 수 없습니다: ${error.message}`)
    },
  })

  const handleAutoFill = () => {
    if (!formData.ticker) {
      alert('티커 코드를 먼저 입력하세요.')
      return
    }
    validateMutation.mutate(formData.ticker)
  }

  // 날짜 입력 핸들러 - 연도 4자리로 제한
  const handleDateInput = (e) => {
    const input = e.target
    let value = input.value
    
    // 날짜 형식이 YYYY-MM-DD인지 확인
    const dateMatch = value.match(/^(\d+)-(\d{2})-(\d{2})$/)
    if (dateMatch) {
      let yearStr = dateMatch[1]
      // 연도가 4자리 초과인 경우 앞 4자리만 사용
      if (yearStr.length > 4) {
        yearStr = yearStr.substring(0, 4)
        value = `${yearStr}-${dateMatch[2]}-${dateMatch[3]}`
        input.value = value
        // onChange 이벤트 트리거
        const syntheticEvent = {
          target: { name: 'purchase_date', value: value }
        }
        handleChange(syntheticEvent)
      }
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    
    // 보유 수량 필드인 경우 숫자만 허용 (타이핑 중에는 raw 값 저장, blur 시 포맷팅)
    if (name === 'quantity') {
      const numericValue = value.replace(/,/g, '')
      if (numericValue === '' || /^\d+$/.test(numericValue)) {
        setFormData(prev => ({ ...prev, [name]: numericValue }))
      }
      return
    }

    // 매입 평균 금액 필드인 경우 숫자(소수점 포함)만 허용 (타이핑 중에는 raw 값 저장, blur 시 포맷팅)
    if (name === 'purchase_price') {
      const numericValue = value.replace(/,/g, '')
      if (numericValue === '' || /^\d*\.?\d*$/.test(numericValue)) {
        setFormData(prev => ({ ...prev, [name]: numericValue }))
      }
      return
    }
    
    // 날짜 필드인 경우 연도 4자리로 정규화
    let processedValue = value
    if (name === 'purchase_date' && value) {
      // 날짜 형식이 YYYY-MM-DD인지 확인하고, 연도가 4자리 초과인 경우 정규화
      const dateMatch = value.match(/^(\d+)-(\d{2})-(\d{2})$/)
      if (dateMatch) {
        let yearStr = dateMatch[1]
        // 연도가 4자리 초과인 경우 앞 4자리만 사용
        if (yearStr.length > 4) {
          yearStr = yearStr.substring(0, 4)
        }
        const year = parseInt(yearStr, 10)
        // 유효한 연도 범위로 제한 (1900-2099)
        if (year >= 1900 && year <= 2099) {
          processedValue = `${yearStr.padStart(4, '0')}-${dateMatch[2]}-${dateMatch[3]}`
        } else {
          // 유효하지 않은 연도인 경우 이전 값 유지
          processedValue = formData.purchase_date || ''
        }
      } else if (value.length > 0) {
        // 형식이 맞지 않으면 이전 값 유지
        processedValue = formData.purchase_date || ''
      }
    }
    
    setFormData(prev => ({ ...prev, [name]: processedValue }))
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

  // 매입 평균 금액 포커스: 콤마 제거하여 raw 값으로 (편집 용이)
  const handlePurchasePriceFocus = () => {
    const raw = formData.purchase_price.toString().replace(/,/g, '')
    setFormData(prev => ({ ...prev, purchase_price: raw }))
  }

  // 매입 평균 금액 블러: 콤마 포맷팅 적용
  const handlePurchasePriceBlur = () => {
    const raw = formData.purchase_price
    if (!raw) return
    const numericStr = raw.replace(/,/g, '')
    const dotIndex = numericStr.indexOf('.')
    let formatted = ''
    if (dotIndex === -1) {
      const intValue = parseInt(numericStr, 10)
      formatted = isNaN(intValue) ? '' : intValue.toLocaleString('ko-KR')
    } else {
      const intPart = numericStr.substring(0, dotIndex)
      const decPart = numericStr.substring(dotIndex)
      const intValue = parseInt(intPart || '0', 10)
      formatted = (isNaN(intValue) ? '0' : intValue.toLocaleString('ko-KR')) + decPart
    }
    setFormData(prev => ({ ...prev, purchase_price: formatted }))
  }

  // 보유 수량 포커스: 콤마 제거하여 raw 값으로 (편집 용이)
  const handleQuantityFocus = () => {
    const raw = formData.quantity.toString().replace(/,/g, '')
    setFormData(prev => ({ ...prev, quantity: raw }))
  }

  // 보유 수량 블러: 콤마 포맷팅 적용
  const handleQuantityBlur = () => {
    const raw = formData.quantity
    if (!raw) return
    const numericStr = raw.replace(/,/g, '')
    const intValue = parseInt(numericStr, 10)
    const formatted = isNaN(intValue) ? '' : intValue.toLocaleString('ko-KR')
    setFormData(prev => ({ ...prev, quantity: formatted }))
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

  // 날짜를 YYYY-MM-DD 형식으로 정규화 (연도 4자리 보장)
  const normalizeDateString = (dateStr) => {
    if (!dateStr) return null
    
    // Date 객체로 파싱 후 다시 포맷
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return null
    
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    
    // 연도가 유효한 범위인지 확인 (1900-2100)
    if (year < 1900 || year > 2100) return null
    
    return `${year}-${month}-${day}`
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    // 제출 데이터 준비
    const submitData = { ...formData }

    // 구매일 정규화 (연도 4자리 형식 보장)
    submitData.purchase_date = normalizeDateString(submitData.purchase_date)

    // 매입 평균 금액을 숫자로 변환 (콤마 제거 후, 빈 값이면 null)
    if (submitData.purchase_price) {
      const numericValue = submitData.purchase_price.toString().replace(/,/g, '')
      submitData.purchase_price = numericValue ? parseFloat(numericValue) : null
    } else {
      submitData.purchase_price = null
    }

    // 보유 수량을 숫자로 변환 (콤마 제거 후, 빈 값이면 null)
    if (submitData.quantity) {
      const numericValue = submitData.quantity.toString().replace(/,/g, '')
      submitData.quantity = numericValue ? parseInt(numericValue, 10) : null
    } else {
      submitData.quantity = null
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

          {/* 구매일 (선택) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              구매일
            </label>
            <input
              type="date"
              name="purchase_date"
              value={formData.purchase_date}
              onChange={handleChange}
              onInput={handleDateInput}
              disabled={isSubmitting}
              min="1900-01-01"
              max="2099-12-31"
              pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              종목을 구매한 날짜입니다. (선택, 연도는 4자리만 입력 가능)
            </p>
          </div>

          {/* 매입 평균 금액 (선택) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              매입 평균 금액
            </label>
            <input
              type="text"
              name="purchase_price"
              value={formData.purchase_price}
              onChange={handleChange}
              onFocus={handlePurchasePriceFocus}
              onBlur={handlePurchasePriceBlur}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="예: 25,000"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              종목을 매입한 평균 단가입니다. (선택, 원 단위)
            </p>
          </div>

          {/* 보유 수량 (선택) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              보유 수량
            </label>
            <input
              type="text"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              onFocus={handleQuantityFocus}
              onBlur={handleQuantityBlur}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="예: 100"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              현재 보유하고 있는 종목 수량입니다. (선택, 주 단위)
            </p>
          </div>

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
