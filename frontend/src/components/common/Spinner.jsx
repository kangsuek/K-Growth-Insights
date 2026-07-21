import PropTypes from 'prop-types'

/**
 * Spinner 컴포넌트
 * 로딩 중임을 나타내는 스피너
 * 
 * @param {string} size - 스피너 크기 ('sm', 'md', 'lg', 기본: 'md')
 * @param {string} color - 스피너 색상 (기본: 'primary')
 */
export default function Spinner({ size = 'md', color = 'primary' }) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  }

  const colorClasses = {
    primary: 'border-primary',
    gray: 'border-gray-400',
    white: 'border-white',
  }

  return (
    <div className="flex justify-center items-center">
      <div className={`animate-spin rounded-full border-b-2 ${sizeClasses[size]} ${colorClasses[color] || colorClasses.primary}`}></div>
    </div>
  )
}

Spinner.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  color: PropTypes.string,
}
