import { useState, useEffect, useCallback } from 'react'
import { settingsApi } from '../../services/api'

/**
 * API 키 설정 패널 컴포넌트
 * 네이버 API 키를 입력하고 저장할 수 있습니다.
 */
export default function ApiKeysPanel() {
  const [keys, setKeys] = useState({
    NAVER_CLIENT_ID: '',
    NAVER_CLIENT_SECRET: '',
  })
  const [configured, setConfigured] = useState({ naver: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [editing, setEditing] = useState(false)

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true)
      const response = await settingsApi.getApiKeys()
      setKeys(response.data.keys)
      setConfigured(response.data.configured)
    } catch (err) {
      console.error('Failed to fetch API keys:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)

      const payload = {}
      if (keys.NAVER_CLIENT_ID && !keys.NAVER_CLIENT_ID.includes('*')) {
        payload.NAVER_CLIENT_ID = keys.NAVER_CLIENT_ID
      }
      if (keys.NAVER_CLIENT_SECRET && !keys.NAVER_CLIENT_SECRET.includes('*')) {
        payload.NAVER_CLIENT_SECRET = keys.NAVER_CLIENT_SECRET
      }
      if (Object.keys(payload).length === 0) {
        setMessage({ type: 'warning', text: '변경된 값이 없습니다. 새 값을 입력해주세요.' })
        return
      }

      await settingsApi.updateApiKeys(payload)
      setMessage({ type: 'success', text: 'API 키가 저장되었습니다.' })
      setEditing(false)
      // 저장 후 마스킹된 값으로 다시 로드
      await fetchKeys()
    } catch (err) {
      setMessage({ type: 'error', text: `저장 실패: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    setEditing(true)
    setMessage(null)
    try {
      const response = await settingsApi.getApiKeys(true)
      setKeys(response.data.keys)
    } catch (err) {
      console.error('Failed to fetch raw API keys:', err)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setMessage(null)
    fetchKeys()
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900">
      {/* 헤더 */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
              API 키 설정
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
              뉴스 수집을 위한 네이버 검색 API 키를 설정합니다
            </p>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              configured.naver
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            }`}
          >
            {configured.naver ? '설정됨' : '미설정'}
          </span>
        </div>
      </div>

      {/* 설정 내용 */}
      <div className="px-4 sm:px-6 py-6 space-y-6">
        {/* 안내 메시지 */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">네이버 검색 API</p>
              <p>
                뉴스 수집 기능을 사용하려면 네이버 개발자 센터에서 API 키를 발급받아야 합니다.
              </p>
              <a
                href="https://developers.naver.com/apps/#/register"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center mt-2 text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                네이버 개발자 센터
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* 네이버 API 키 섹션 */}
        <section>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
            네이버 검색 API
          </h3>
          <div className="space-y-4">
            {/* Client ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client ID
              </label>
              <input
                type="text"
                value={keys.NAVER_CLIENT_ID}
                onChange={(e) => setKeys({ ...keys, NAVER_CLIENT_ID: e.target.value })}
                disabled={!editing}
                placeholder={editing ? '네이버 API Client ID를 입력하세요' : ''}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-400 font-mono"
              />
            </div>

            {/* Client Secret */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client Secret
              </label>
              <input
                type={editing ? 'text' : 'password'}
                value={keys.NAVER_CLIENT_SECRET}
                onChange={(e) => setKeys({ ...keys, NAVER_CLIENT_SECRET: e.target.value })}
                disabled={!editing}
                placeholder={editing ? '네이버 API Client Secret을 입력하세요' : ''}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-400 font-mono"
              />
            </div>
          </div>
        </section>

        {/* 메시지 */}
        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                : message.type === 'error'
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-3">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                취소
              </button>
            </>
          ) : (
            <button
              onClick={handleEdit}
              className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              수정
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
