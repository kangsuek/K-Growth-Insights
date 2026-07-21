import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAlertStore } from '../contexts/AlertContext'

export default function Alerts() {
  const { alerts, clearAll } = useAlertStore()
  const [filter, setFilter] = useState('all') // all | price_target | price_change | signal

  const filteredAlerts = filter === 'all'
    ? alerts
    : alerts.filter(a => a.alert_type === filter)

  const typeLabel = {
    price_target: '목표가',
    price_change: '급등/급락',
    buy: '매수 시그널',
    sell: '매도 시그널',
  }

  const typeDot = {
    price_target: 'bg-purple-400',
    price_change: 'bg-orange-400',
    buy: 'bg-red-400',
    sell: 'bg-blue-400',
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">알림 관리</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          알림 규칙 설정과 알림 이력을 확인하세요
        </p>
      </div>

      {/* 필터 탭 */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'all', label: '전체' },
          { key: 'price_target', label: '목표가' },
          { key: 'price_change', label: '급등/급락' },
          { key: 'buy', label: '매수 시그널' },
          { key: 'sell', label: '매도 시그널' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              filter === key
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
        {alerts.length > 0 && (
          <button
            onClick={clearAll}
            className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            모두 지우기
          </button>
        )}
      </div>

      {/* 알림 이력 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filteredAlerts.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">알림 이력이 없습니다</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              종목 상세 페이지에서 알림을 설정할 수 있습니다
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {filteredAlerts.map(alert => (
              <li key={alert.id}>
                <Link
                  to={`/etf/${alert.ticker}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${typeDot[alert.alert_type] || 'bg-gray-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 dark:text-gray-200">{alert.message}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                      <span>{typeLabel[alert.alert_type] || alert.alert_type}</span>
                      <span>·</span>
                      <time>{new Date(alert.timestamp).toLocaleString('ko-KR', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}</time>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 안내 */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
        <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">알림 규칙 설정</h3>
        <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
          각 종목의 상세 페이지에서 목표가, 급등/급락, 매매 시그널 알림을 설정할 수 있습니다.
          브라우저 푸시 알림은 추후 지원 예정입니다.
        </p>
      </div>
    </div>
  )
}
