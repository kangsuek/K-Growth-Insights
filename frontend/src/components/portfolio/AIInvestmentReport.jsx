import { useState, useMemo, useRef } from 'react'
import PropTypes from 'prop-types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { etfApi } from '../../services/api'
import Spinner from '../common/Spinner'

export default function AIInvestmentReport({ investedETFs, trackingETFs, batchSummary }) {
  const [selectedTickers, setSelectedTickers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [prompt, setPrompt] = useState(null)
  const [promptTitle, setPromptTitle] = useState('')
  const [copied, setCopied] = useState(false)
  const cacheRef = useRef({})

  const allETFs = useMemo(() => [
    ...(investedETFs || []).map(e => ({ ...e, _group: 'invested' })),
    ...(trackingETFs || []).map(e => ({ ...e, _group: 'tracking' })),
  ], [investedETFs, trackingETFs])

  const findETF = (ticker) => allETFs.find(e => e.ticker === ticker)

  const handleClick = (ticker, e) => {
    const isShift = e.shiftKey
    if (isShift) {
      setSelectedTickers(prev => {
        const exists = prev.includes(ticker)
        return exists ? prev.filter(t => t !== ticker) : [...prev, ticker]
      })
    } else {
      setSelectedTickers(prev =>
        prev.length === 1 && prev[0] === ticker ? [] : [ticker]
      )
    }
    setPrompt(null)
    setError(null)
    setCopied(false)
  }

  const handleGeneratePrompt = async () => {
    if (selectedTickers.length === 0) return

    const isMulti = selectedTickers.length >= 2
    const cacheKey = isMulti
      ? `multi:${[...selectedTickers].sort().join(',')}`
      : selectedTickers[0]

    if (cacheRef.current[cacheKey]) {
      setPrompt(cacheRef.current[cacheKey])
      setPromptTitle(isMulti
        ? selectedTickers.map(t => findETF(t)?.name).filter(Boolean).join(' vs ')
        : findETF(selectedTickers[0])?.name || ''
      )
      return
    }

    setPrompt(null)
    setError(null)
    setCopied(false)
    setLoading(true)

    try {
      let data
      if (isMulti) {
        const stocks = selectedTickers.map(t => {
          const etf = findETF(t)
          return { ticker: t, name: etf?.name || t }
        })
        const response = await etfApi.getAIPromptMulti(stocks)
        data = response.data
        setPromptTitle(stocks.map(s => s.name).join(' vs '))
      } else {
        const ticker = selectedTickers[0]
        const response = await etfApi.getAIPrompt(ticker)
        data = response.data
        setPromptTitle(findETF(ticker)?.name || '')
      }
      cacheRef.current[cacheKey] = data.prompt
      setPrompt(data.prompt)
    } catch (err) {
      const detail = err.response?.data?.detail || err.message
      setError(detail)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = prompt
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    if (!prompt) return
    const dateStr = new Date().toISOString().slice(0, 10)
    const blob = new Blob([prompt], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `AI분석_프롬프트_${promptTitle.replace(/\s+/g, '_')}_${dateStr}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (allETFs.length === 0) return null

  const getChangePct = (ticker) => {
    const summary = batchSummary?.[ticker]
    return summary?.latest_price?.daily_change_pct
  }

  const isMultiMode = selectedTickers.length >= 2

  const renderChip = (etf, isDashed = false) => {
    const isSelected = selectedTickers.includes(etf.ticker)
    const changePct = getChangePct(etf.ticker)
    const changeColor = changePct > 0 ? 'text-red-500' : changePct < 0 ? 'text-blue-500' : 'text-gray-500'
    return (
      <button
        key={etf.ticker}
        onClick={(e) => handleClick(etf.ticker, e)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-150 ${isDashed ? 'border-dashed' : ''} ${
          isSelected
            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-400 dark:border-purple-500 text-purple-700 dark:text-purple-300 shadow-sm'
            : isDashed
              ? 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
              : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
        }`}
      >
        <span>{etf.name}</span>
        {changePct != null && (
          <span className={`ml-1 text-xs ${changeColor}`}>
            {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          AI 투자분석 프롬프트
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          종목을 선택하면 투자분석 프롬프트를 생성합니다. 복사하여 Perplexity, Gemini, ChatGPT, Claude 등에 붙여넣기하세요.
        </p>
      </div>

      <div className="p-5">
        {/* Shift hint */}
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          클릭: 개별 선택 | Shift+클릭: 복수 선택 (통합 비교 프롬프트)
        </p>

        {/* Stock chips - Invested */}
        {investedETFs && investedETFs.length > 0 && (
          <div className="mb-3">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-2">투자</span>
            <div className="inline-flex flex-wrap gap-2">
              {investedETFs.map((etf) => renderChip(etf, false))}
            </div>
          </div>
        )}

        {/* Stock chips - Tracking */}
        {trackingETFs && trackingETFs.length > 0 && (
          <div className="mb-4">
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mr-2">관찰</span>
            <div className="inline-flex flex-wrap gap-2">
              {trackingETFs.map((etf) => renderChip(etf, true))}
            </div>
          </div>
        )}

        {/* Action bar */}
        {selectedTickers.length > 0 && !loading && (
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
              <span className="text-sm text-purple-700 dark:text-purple-300">
                {selectedTickers.length}개 종목 선택됨
              </span>
              <button
                onClick={handleGeneratePrompt}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isMultiMode ? '통합 비교 프롬프트 생성' : '프롬프트 생성'}
              </button>
              <button
                onClick={() => { setSelectedTickers([]); setPrompt(null); setError(null) }}
                className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                선택 해제
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {selectedTickers.length === 0 && !prompt && (
          <div className="text-center py-10 text-gray-400 dark:text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>종목을 선택하면 AI 투자분석 프롬프트를 생성합니다</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-10">
            <Spinner />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">프롬프트 생성 중...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Prompt Display */}
        {prompt && !loading && (
          <div>
            {/* Title bar with action buttons */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h4 className="text-base font-bold text-gray-800 dark:text-gray-100">
                  {promptTitle} {isMultiMode ? '통합 비교 분석 프롬프트' : '투자분석 프롬프트'}
                </h4>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 기준
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    copied
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {copied ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                  {copied ? '복사됨!' : '복사'}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  다운로드
                </button>
              </div>
            </div>

            {/* LLM quick links */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-400 dark:text-gray-500">바로가기:</span>
              {[
                { name: 'Perplexity', url: 'https://www.perplexity.ai/' },
                { name: 'ChatGPT', url: 'https://chatgpt.com/' },
                { name: 'Claude', url: 'https://claude.ai/' },
                { name: 'Gemini', url: 'https://gemini.google.com/' },
              ].map(({ name, url }) => (
                <a
                  key={name}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                >
                  {name}
                </a>
              ))}
            </div>

            {/* Prompt content as rendered markdown */}
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto p-5">
                <article className="prose dark:prose-invert max-w-none prose-sm
                  prose-headings:text-gray-800 dark:prose-headings:text-gray-200
                  prose-p:text-gray-600 dark:prose-p:text-gray-300 prose-p:leading-relaxed
                  prose-li:text-gray-600 dark:prose-li:text-gray-300
                  prose-strong:text-gray-800 dark:prose-strong:text-gray-100
                  prose-hr:border-gray-200 dark:prose-hr:border-gray-700
                  prose-table:text-sm
                ">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {prompt}
                  </ReactMarkdown>
                </article>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

AIInvestmentReport.propTypes = {
  investedETFs: PropTypes.array.isRequired,
  trackingETFs: PropTypes.array,
  batchSummary: PropTypes.object,
}
