import { useEffect } from 'react'
import PropTypes from 'prop-types'
import { useToast } from '../../contexts/ToastContext'

const Toast = ({ id, message, type = 'info', duration = 3000 }) => {
  const { removeToast } = useToast()

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        removeToast(id)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [id, duration, removeToast])

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      case 'info':
      default:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  const getStyles = () => {
    const baseStyles = "flex items-center gap-3 min-w-[300px] max-w-md p-4 rounded-lg shadow-lg animate-slide-in"
    switch (type) {
      case 'success':
        return `${baseStyles} bg-green-50 dark:bg-green-900 text-green-800 dark:text-green-100 border border-green-200 dark:border-green-700`
      case 'error':
        return `${baseStyles} bg-red-50 dark:bg-red-900 text-red-800 dark:text-red-100 border border-red-200 dark:border-red-700`
      case 'warning':
        return `${baseStyles} bg-yellow-50 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 border border-yellow-200 dark:border-yellow-700`
      case 'info':
      default:
        return `${baseStyles} bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-100 border border-blue-200 dark:border-blue-700`
    }
  }

  return (
    <div
      className={getStyles()}
      role="alert"
      aria-live="polite"
    >
      <div className="flex-shrink-0">
        {getIcon()}
      </div>
      <div className="flex-1 text-sm font-medium">
        {message}
      </div>
      <button
        onClick={() => removeToast(id)}
        className="flex-shrink-0 ml-2 hover:opacity-70 transition-opacity"
        aria-label="닫기"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

Toast.propTypes = {
  id: PropTypes.number.isRequired,
  message: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['success', 'error', 'warning', 'info']),
  duration: PropTypes.number
}

export default Toast
