import { useState } from 'react'
import LumpSumSimulation from '../components/simulation/LumpSumSimulation'
import DCASimulation from '../components/simulation/DCASimulation'
import PortfolioSimulation from '../components/simulation/PortfolioSimulation'

const TABS = [
  { key: 'lump-sum', label: '일시 투자' },
  { key: 'dca', label: '적립식 투자' },
  { key: 'portfolio', label: '포트폴리오' },
]

export default function Simulation() {
  const [activeTab, setActiveTab] = useState('lump-sum')

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">시뮬레이션</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          과거 데이터 기반 투자 시뮬레이션 — &quot;그때 샀다면?&quot;
        </p>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4" aria-label="시뮬레이션 탭">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 탭 컨텐츠 */}
      {activeTab === 'lump-sum' && <LumpSumSimulation />}
      {activeTab === 'dca' && <DCASimulation />}
      {activeTab === 'portfolio' && <PortfolioSimulation />}
    </div>
  )
}
