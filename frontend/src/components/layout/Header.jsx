import { Link, useLocation } from 'react-router-dom'
import { useState, useCallback } from 'react'

const NAV_BASE = 'px-3 py-2 rounded-md text-sm font-medium transition-all duration-200'
const NAV_ACTIVE = `${NAV_BASE} bg-primary-500 text-white shadow-md`
const NAV_INACTIVE = `${NAV_BASE} text-gray-700 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-gray-700 hover:text-primary-600 dark:hover:text-primary-400`
const MOBILE_BASE = 'block px-3 py-2 rounded-md text-base font-medium transition-all duration-200'
const MOBILE_ACTIVE = `${MOBILE_BASE} bg-primary-500 text-white shadow-md`
const MOBILE_INACTIVE = `${MOBILE_BASE} text-gray-700 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-gray-700 hover:text-primary-600 dark:hover:text-primary-400`

export default function Header() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinkClass = useCallback((path) =>
    location.pathname === path ? NAV_ACTIVE : NAV_INACTIVE,
  [location.pathname])

  const mobileNavLinkClass = useCallback((path) =>
    location.pathname === path ? MOBILE_ACTIVE : MOBILE_INACTIVE,
  [location.pathname])

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-50 transition-colors">
      <nav className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* 로고 및 서비스 이름 */}
          <Link to="/" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-lg">
            <div className="w-10 h-10 rounded-lg overflow-hidden transform group-hover:scale-110 transition-all duration-300 shadow-md group-hover:shadow-lg">
              <img src="/favicon.svg" alt="K-Growth Insights Logo" className="w-full h-full" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-200">
                K-Growth Insights
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">한국 고성장 섹터 분석</p>
            </div>
          </Link>

          {/* 데스크톱 네비게이션 */}
          <div className="hidden md:flex items-center gap-2">
            <Link to="/" className={navLinkClass('/')}>
              대시보드
            </Link>
            <Link to="/scanner" className={navLinkClass('/scanner')}>
              종목 발굴
            </Link>
            <Link to="/compare" className={navLinkClass('/compare')}>
              비교
            </Link>
            <Link to="/simulation" className={navLinkClass('/simulation')}>
              시뮬레이션
            </Link>
            <Link to="/portfolio" className={navLinkClass('/portfolio')}>
              포트폴리오
            </Link>
            <Link to="/settings" className={navLinkClass('/settings')}>
              <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              설정
            </Link>
            <a
              href="https://github.com/kangsuek/K-Growth-Insights"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="GitHub"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
          </div>

          {/* 모바일 햄버거 메뉴 버튼 */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors"
            aria-label={mobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* 모바일 메뉴 */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 pb-3 space-y-1 border-t border-gray-200 dark:border-gray-700 pt-3 animate-slideDown">
            <Link to="/" className={mobileNavLinkClass('/')} onClick={() => setMobileMenuOpen(false)}>
              대시보드
            </Link>
            <Link to="/scanner" className={mobileNavLinkClass('/scanner')} onClick={() => setMobileMenuOpen(false)}>
              종목 발굴
            </Link>
            <Link to="/compare" className={mobileNavLinkClass('/compare')} onClick={() => setMobileMenuOpen(false)}>
              비교
            </Link>
            <Link to="/simulation" className={mobileNavLinkClass('/simulation')} onClick={() => setMobileMenuOpen(false)}>
              시뮬레이션
            </Link>
            <Link to="/portfolio" className={mobileNavLinkClass('/portfolio')} onClick={() => setMobileMenuOpen(false)}>
              포트폴리오
            </Link>
            <Link to="/settings" className={mobileNavLinkClass('/settings')} onClick={() => setMobileMenuOpen(false)}>
              <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              설정
            </Link>
          </div>
        )}
      </nav>
    </header>
  )
}
