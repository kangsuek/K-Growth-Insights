import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'

// 액션(success/error/...)과 목록(toasts)을 별도 컨텍스트로 분리한다.
// 하나로 묶으면 토스트가 뜨거나 사라질 때마다(즉 아무 토스트나 하나만 움직여도)
// value 객체 참조가 통째로 바뀌어, useToast()를 의존성 배열에 넣은 다른 화면의
// useEffect/useCallback(예: 자동 새로고침 인터벌)이 그때마다 재실행돼 버린다.
const ToastActionsContext = createContext(null)
const ToastStateContext = createContext(null)

export const useToast = () => {
  const context = useContext(ToastActionsContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

// 토스트 목록(현재 떠 있는 토스트들)이 필요한 곳(ToastContainer)에서만 사용한다.
export const useToastState = () => {
  const context = useContext(ToastStateContext)
  if (!context) {
    throw new Error('useToastState must be used within a ToastProvider')
  }
  return context
}

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = crypto.randomUUID()
    const toast = { id, message, type, duration }

    setToasts(prev => [...prev, toast])

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }, [removeToast])

  const success = useCallback((message, duration) => {
    return addToast(message, 'success', duration)
  }, [addToast])

  const error = useCallback((message, duration) => {
    return addToast(message, 'error', duration)
  }, [addToast])

  const warning = useCallback((message, duration) => {
    return addToast(message, 'warning', duration)
  }, [addToast])

  const info = useCallback((message, duration) => {
    return addToast(message, 'info', duration)
  }, [addToast])

  // 액션 전용 값: toasts에 의존하지 않으므로 Provider가 살아있는 동안 참조가
  // 절대 바뀌지 않는다(재생성 없음).
  const actions = useMemo(() => ({
    addToast,
    removeToast,
    success,
    error,
    warning,
    info
  }), [addToast, removeToast, success, error, warning, info])

  // 목록 전용 값: toasts가 바뀔 때만 재생성된다(ToastContainer만 구독).
  const state = useMemo(() => ({ toasts }), [toasts])

  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastStateContext.Provider value={state}>
        {children}
      </ToastStateContext.Provider>
    </ToastActionsContext.Provider>
  )
}

ToastProvider.propTypes = {
  children: PropTypes.node.isRequired
}

export default ToastActionsContext
