import { createContext, useContext, useState, useCallback } from 'react'
import PropTypes from 'prop-types'

const AlertContext = createContext(null)

export const useAlertStore = () => {
  const context = useContext(AlertContext)
  if (!context) {
    throw new Error('useAlertStore must be used within an AlertProvider')
  }
  return context
}

/**
 * 전역 알림 이력 저장소
 * - useAlertChecker에서 알림 발생 시 push
 * - Header 벨 아이콘에서 표시
 */
export const AlertProvider = ({ children }) => {
  const [alerts, setAlerts] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  const pushAlert = useCallback((alert) => {
    const entry = {
      id: crypto.randomUUID(),
      ...alert,
      timestamp: new Date().toISOString(),
      read: false,
    }
    setAlerts(prev => [entry, ...prev].slice(0, 50)) // 최대 50개 유지
    setUnreadCount(prev => prev + 1)
  }, [])

  const markAllRead = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })))
    setUnreadCount(0)
  }, [])

  const clearAll = useCallback(() => {
    setAlerts([])
    setUnreadCount(0)
  }, [])

  return (
    <AlertContext.Provider value={{ alerts, unreadCount, pushAlert, markAllRead, clearAll }}>
      {children}
    </AlertContext.Provider>
  )
}

AlertProvider.propTypes = {
  children: PropTypes.node.isRequired,
}

export default AlertContext
