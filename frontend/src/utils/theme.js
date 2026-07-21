/**
 * 테마 감지·적용 공용 유틸
 *
 * main.jsx(초기 FOUC 방지)와 SettingsContext.jsx가 동일한 테마 로직을 공유한다.
 * ('light' | 'dark' | 'system' 세 가지 theme 값을 다룬다.)
 */

export const THEME_STORAGE_KEY = 'app_settings'
const DEFAULT_THEME = 'light'

/** 시스템 테마 감지 (prefers-color-scheme 미디어 쿼리) */
export function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** 실제 적용할 테마 계산 (system인 경우 시스템 설정 반영) */
export function getEffectiveTheme(theme) {
  return theme === 'system' ? getSystemTheme() : theme
}

/** HTML 루트(html 태그)에 dark 클래스 적용/제거 */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  // 확실한 적용을 위해 기존 dark 클래스를 먼저 제거 후 필요 시 추가
  root.classList.remove('dark')
  if (getEffectiveTheme(theme) === 'dark') {
    root.classList.add('dark')
  }
}

/**
 * LocalStorage(app_settings)에서 저장된 theme 값만 읽어온다.
 * 초기 렌더 전 FOUC 방지용 — 전체 설정 파싱 없이 theme만 필요할 때 사용.
 */
export function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed && parsed.theme) return parsed.theme
    }
  } catch {
    // 파싱 실패 시 기본값 사용
  }
  return DEFAULT_THEME
}
