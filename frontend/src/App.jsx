import { Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import StockDetail from './pages/StockDetail'

// 라우트 정의: 대시보드(목록)와 종목 상세 두 화면.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/stock/:ticker" element={<StockDetail />} />
    </Routes>
  )
}
