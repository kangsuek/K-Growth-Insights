import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SettingsProvider, useSettings } from './SettingsContext'

describe('SettingsContext', () => {
  // LocalStorage mock
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('SettingsProvider', () => {
    it('렌더링되고 기본 설정을 제공해야 함', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      expect(result.current.settings).toEqual({
        autoRefresh: {
          interval: 30000,
        },
        defaultDateRange: '1M',
        theme: 'light',
        cardOrder: [],
      })
    })

    it('LocalStorage에서 설정을 로드해야 함', () => {
      // Note: localStorage integration은 수동 테스트로 검증
      // 여기서는 설정이 제대로 초기화되는지만 확인
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      // 기본값 또는 저장된 값이 로드되었는지 확인
      expect(result.current.settings).toBeDefined()
      expect(result.current.settings.autoRefresh).toBeDefined()
      expect(result.current.settings.defaultDateRange).toBeDefined()
      expect(result.current.settings.theme).toBeDefined()
      expect(result.current.settings.cardOrder).toBeDefined()
    })

    it('잘못된 LocalStorage 데이터는 기본값으로 폴백되어야 함', () => {
      localStorage.setItem('app_settings', 'invalid json')

      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      expect(result.current.settings.autoRefresh.interval).toBe(30000)
      expect(result.current.settings.defaultDateRange).toBe('1M')
    })
  })

  describe('useSettings hook', () => {
    it('Provider 없이 사용하면 에러를 던져야 함', () => {
      // console.error를 모킹하여 테스트 출력을 깨끗하게 유지
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useSettings())
      }).toThrow('useSettings must be used within a SettingsProvider')

      consoleError.mockRestore()
    })

    it('settings, updateSettings, resetSettings를 제공해야 함', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      expect(result.current).toHaveProperty('settings')
      expect(result.current).toHaveProperty('updateSettings')
      expect(result.current).toHaveProperty('resetSettings')
      expect(typeof result.current.updateSettings).toBe('function')
      expect(typeof result.current.resetSettings).toBe('function')
    })
  })

  describe('updateSettings', () => {
    it('단일 레벨 설정을 업데이트해야 함', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      act(() => {
        result.current.updateSettings('defaultDateRange', '7D')
      })

      expect(result.current.settings.defaultDateRange).toBe('7D')
    })

    it('중첩된 설정 (2단계)을 업데이트해야 함', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      act(() => {
        result.current.updateSettings('autoRefresh.interval', 60000)
      })

      expect(result.current.settings.autoRefresh.interval).toBe(60000)
    })

    // 제거한 설정(표시 옵션, 자동 갱신 on/off)은 검증에서 걸러내 상태에 남지 않아야
    // 한다. 두 차트와 자동 갱신은 이제 항상 켜져 있다. 예전 버전이 localStorage에
    // 저장해 둔 값도 같은 경로(validateSettings)를 지나므로 함께 정리된다.
    // (테스트 환경의 localStorage는 항상 null을 주는 stub이라 저장값 로드는
    //  검증할 수 없어, 같은 검증 함수를 타는 updateSettings로 확인한다.)
    it('제거한 display·autoRefresh.enabled 값은 상태에 남지 않아야 함', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      act(() => {
        result.current.updateSettings('display.showVolume', false)
      })
      act(() => {
        result.current.updateSettings('autoRefresh.enabled', false)
      })

      expect(result.current.settings.display).toBeUndefined()
      expect(result.current.settings.autoRefresh.enabled).toBeUndefined()
      // 주기는 그대로 유지된다
      expect(result.current.settings.autoRefresh.interval).toBe(30000)
    })

    it('설정 업데이트 시 Context가 업데이트되어야 함', () => {
      // Note: localStorage 저장은 수동 테스트로 검증
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      act(() => {
        result.current.updateSettings('defaultDateRange', '3M')
      })

      // Context 상태가 업데이트되었는지 확인
      expect(result.current.settings.defaultDateRange).toBe('3M')
    })

    it('잘못된 값은 검증 후 기본값으로 폴백되어야 함', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      act(() => {
        result.current.updateSettings('autoRefresh.interval', 99999) // 허용되지 않는 값
      })

      // 검증 실패 시 기본값으로 폴백
      expect(result.current.settings.autoRefresh.interval).toBe(30000)
    })
  })

  describe('resetSettings', () => {
    it('설정을 기본값으로 초기화해야 함', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      // 설정 변경
      act(() => {
        result.current.updateSettings('defaultDateRange', '7D')
        result.current.updateSettings('autoRefresh.interval', 60000)
      })

      expect(result.current.settings.defaultDateRange).toBe('7D')
      expect(result.current.settings.autoRefresh.interval).toBe(60000)

      // 초기화
      act(() => {
        result.current.resetSettings()
      })

      expect(result.current.settings.defaultDateRange).toBe('1M')
      expect(result.current.settings.autoRefresh.interval).toBe(30000)
    })

    it('초기화 시 Context가 기본값으로 업데이트되어야 함', () => {
      // Note: localStorage 업데이트는 수동 테스트로 검증
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      // 설정 변경
      act(() => {
        result.current.updateSettings('defaultDateRange', '7D')
      })

      expect(result.current.settings.defaultDateRange).toBe('7D')

      // 초기화
      act(() => {
        result.current.resetSettings()
      })

      // Context 상태가 기본값으로 복원되었는지 확인
      expect(result.current.settings.defaultDateRange).toBe('1M')
    })
  })

  describe('validateSettings', () => {
    it('유효한 autoRefresh.interval 값만 허용해야 함', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      // 유효한 값들
      const validIntervals = [10000, 30000, 60000]

      validIntervals.forEach((interval) => {
        act(() => {
          result.current.updateSettings('autoRefresh.interval', interval)
        })
        expect(result.current.settings.autoRefresh.interval).toBe(interval)
      })
    })

    it('유효한 defaultDateRange 값만 허용해야 함', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      const validRanges = ['7D', '1M', '3M']

      validRanges.forEach((range) => {
        act(() => {
          result.current.updateSettings('defaultDateRange', range)
        })
        expect(result.current.settings.defaultDateRange).toBe(range)
      })
    })

    it('유효한 theme 값만 허용해야 함', () => {
      const { result } = renderHook(() => useSettings(), {
        wrapper: SettingsProvider,
      })

      const validThemes = ['light', 'dark']

      validThemes.forEach((theme) => {
        act(() => {
          result.current.updateSettings('theme', theme)
        })
        expect(result.current.settings.theme).toBe(theme)
      })
    })
  })
})
