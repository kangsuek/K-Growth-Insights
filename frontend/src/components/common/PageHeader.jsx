import PropTypes from 'prop-types'

/**
 * PageHeader 컴포넌트
 * 페이지 상단 헤더 영역
 * 
 * @param {string} title - 페이지 제목
 * @param {string|ReactNode} subtitle - 부제목 (선택)
 * @param {ReactNode} children - 우측 액션 버튼 등 (선택)
 */
export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h1>
          {subtitle && (
            <p className="text-gray-600 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  children: PropTypes.node,
}
