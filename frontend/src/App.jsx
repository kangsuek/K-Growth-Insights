import { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsProvider } from './contexts/SettingsContext'
import { ToastProvider } from './contexts/ToastContext'
import { AlertProvider } from './contexts/AlertContext'
import ErrorBoundary from './components/common/ErrorBoundary'
import ToastContainer from './components/common/ToastContainer'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import LoadingIndicator from './components/common/LoadingIndicator'
import { CACHE_STALE_TIME_FAST, CACHE_GC_TIME } from './constants'

// Lazy loading pages
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const ETFDetail = lazy(() => import('./pages/ETFDetail.jsx'))
const Comparison = lazy(() => import('./pages/Comparison.jsx'))
const Portfolio = lazy(() => import('./pages/Portfolio.jsx'))
const Screening = lazy(() => import('./pages/Screening.jsx'))
const Alerts = lazy(() => import('./pages/Alerts.jsx'))
const Simulation = lazy(() => import('./pages/Simulation.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))

// TanStack Query 클라이언트 설정
// 백엔드 캐시 TTL과 일치하도록 설정
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: CACHE_STALE_TIME_FAST, // 30초 (기본값)
      gcTime: CACHE_GC_TIME, // 10분 (메모리 유지 시간)
    },
  },
})

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <ToastProvider>
            <AlertProvider>
            <Router>
              <ErrorBoundary>
                <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
                  <Header />
                  <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                    <ErrorBoundary>
                      <Suspense fallback={
                        <div className="flex justify-center items-center h-64">
                          <LoadingIndicator size="lg" text="페이지 로딩 중..." />
                        </div>
                      }>
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/etf/:ticker" element={<ETFDetail />} />
                          <Route path="/portfolio" element={<Portfolio />} />
                          <Route path="/compare" element={<Comparison />} />
                          <Route path="/scanner" element={<Screening />} />
                          <Route path="/simulation" element={<Simulation />} />
                          <Route path="/alerts" element={<Alerts />} />
                          <Route path="/settings" element={<Settings />} />
                        </Routes>
                      </Suspense>
                    </ErrorBoundary>
                  </main>
                  <Footer />
                </div>
              </ErrorBoundary>
              <ToastContainer />
            </Router>
          </AlertProvider>
          </ToastProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
