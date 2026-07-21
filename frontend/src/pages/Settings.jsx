import { useLocation } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import TickerManagementPanel from '../components/settings/TickerManagementPanel'
import GeneralSettingsPanel from '../components/settings/GeneralSettingsPanel'
import ApiKeysPanel from '../components/settings/ApiKeysPanel'
import DataManagementPanel from '../components/settings/DataManagementPanel'

export default function Settings() {
  const location = useLocation()
  const addStock = location.state?.addStock || null

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-0">
      <PageHeader
        title="설정"
        description="종목 관리 및 환경 설정"
      />

      {/* 일반 설정 (테마, 자동 갱신, 날짜 범위, 표시 옵션) */}
      <div className="mt-4 sm:mt-6">
        <GeneralSettingsPanel />
      </div>

      {/* 종목 관리 섹션 */}
      <div className="mt-6 sm:mt-8">
        <TickerManagementPanel prefillStock={addStock} />
      </div>

      {/* API 키 설정 섹션 */}
      <div className="mt-6 sm:mt-8">
        <ApiKeysPanel />
      </div>

      {/* 데이터 관리 섹션 */}
      <div className="mt-6 sm:mt-8">
        <DataManagementPanel />
      </div>
    </div>
  )
}
