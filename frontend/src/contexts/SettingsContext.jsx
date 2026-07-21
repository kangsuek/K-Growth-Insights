import { createContext, useContext, useState, useEffect } from 'react'
import { applyTheme } from '../utils/theme'

const STORAGE_KEY = 'app_settings'

/**
 * 기본 설정값
 */
const DEFAULT_SETTINGS = {
  autoRefresh: {
    enabled: true,
    interval: 30000, // 30초 (milliseconds)
  },
  defaultDateRange: '1M', // "7D" | "1M" | "3M"
  theme: 'light', // "light" | "dark" | "system"
  display: {
    showVolume: true,
    showTradingFlow: true,
  },
  cardOrder: [], // 사용자 정의 카드 순서 (ticker 배열)
}

/**
 * 설정 스키마 검증
 * @param {Object} settings - 검증할 설정 객체
 * @returns {Object} 검증된 설정 객체 (잘못된 값은 기본값으로 대체)
 */
function validateSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return DEFAULT_SETTINGS
  }

  const validated = { ...DEFAULT_SETTINGS }

  // autoRefresh 검증
  if (settings.autoRefresh && typeof settings.autoRefresh === 'object') {
    validated.autoRefresh = {
      enabled: typeof settings.autoRefresh.enabled === 'boolean'
        ? settings.autoRefresh.enabled
        : DEFAULT_SETTINGS.autoRefresh.enabled,
      interval: [30000, 60000, 300000, 600000].includes(settings.autoRefresh.interval)
        ? settings.autoRefresh.interval
        : DEFAULT_SETTINGS.autoRefresh.interval,
    }
  }

  // defaultDateRange 검증
  if (['7D', '1M', '3M'].includes(settings.defaultDateRange)) {
    validated.defaultDateRange = settings.defaultDateRange
  }

  // theme 검증
  if (['light', 'dark', 'system'].includes(settings.theme)) {
    validated.theme = settings.theme
  }

  // display 검증
  if (settings.display && typeof settings.display === 'object') {
    validated.display = {
      showVolume: typeof settings.display.showVolume === 'boolean'
        ? settings.display.showVolume
        : DEFAULT_SETTINGS.display.showVolume,
      showTradingFlow: typeof settings.display.showTradingFlow === 'boolean'
        ? settings.display.showTradingFlow
        : DEFAULT_SETTINGS.display.showTradingFlow,
    }
  }

  // cardOrder 검증
  if (Array.isArray(settings.cardOrder)) {
    validated.cardOrder = settings.cardOrder.filter(item => typeof item === 'string')
  }

  return validated
}

/**
 * LocalStorage에서 설정 로드
 */
function loadSettingsFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return validateSettings(parsed)
    }
  } catch (error) {
    // Failed to load settings - use defaults
  }
  return DEFAULT_SETTINGS
}

/**
 * LocalStorage에 설정 저장
 */
function saveSettingsToStorage(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    // Failed to save settings
  }
}

// Context 생성
const SettingsContext = createContext(null)

/**
 * Settings Provider 컴포넌트
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    const loadedSettings = loadSettingsFromStorage()
    // 초기 로드 시 즉시 테마 적용
    if (typeof document !== 'undefined') {
      applyTheme(loadedSettings.theme)
    }
    return loadedSettings
  })

  // 설정 변경 시 LocalStorage에 저장
  useEffect(() => {
    saveSettingsToStorage(settings)
  }, [settings])

  // 테마 변경 시 즉시 적용
  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  // 시스템 테마 변경 감지 (theme이 'system'인 경우)
  useEffect(() => {
    if (settings.theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      applyTheme('system')
    }

    // 초기 적용
    applyTheme('system')

    // 최신 브라우저
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } 
    // 구형 브라우저 지원
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange)
      return () => mediaQuery.removeListener(handleChange)
    }
  }, [settings.theme])

  /**
   * 설정 업데이트
   * @param {string} key - 업데이트할 설정 키 (점 표기법 지원: "autoRefresh.enabled")
   * @param {*} value - 새 값
   */
  const updateSettings = (key, value) => {
    setSettings((prev) => {
      const keys = key.split('.')
      const newSettings = { ...prev }

      // 중첩된 객체 업데이트 처리
      if (keys.length === 1) {
        newSettings[keys[0]] = value
      } else if (keys.length === 2) {
        newSettings[keys[0]] = {
          ...newSettings[keys[0]],
          [keys[1]]: value,
        }
      } else if (keys.length === 3) {
        newSettings[keys[0]] = {
          ...newSettings[keys[0]],
          [keys[1]]: {
            ...newSettings[keys[0]][keys[1]],
            [keys[2]]: value,
          },
        }
      }

      return validateSettings(newSettings)
    })
  }

  /**
   * 설정을 기본값으로 초기화
   */
  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS)
    saveSettingsToStorage(DEFAULT_SETTINGS)
  }

  const value = {
    settings,
    updateSettings,
    resetSettings,
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

/**
 * useSettings 커스텀 훅
 * @returns {{ settings: Object, updateSettings: Function, resetSettings: Function }}
 */
export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

export default SettingsContext
