import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  sampleData,
  measureChartPerformance,
  validateChartData,
  getResponsiveChartHeight
} from './chartUtils'

describe('chartUtils', () => {
  describe('sampleData', () => {
    it('빈 배열을 반환한다 (데이터가 없을 때)', () => {
      expect(sampleData(null)).toEqual([])
      expect(sampleData(undefined)).toEqual([])
      expect(sampleData([])).toEqual([])
    })

    it('데이터가 maxPoints보다 적으면 원본을 반환한다', () => {
      const data = [1, 2, 3, 4, 5]
      expect(sampleData(data, 10)).toEqual(data)
      expect(sampleData(data, 5)).toEqual(data)
    })

    it('데이터가 maxPoints보다 많으면 샘플링한다', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i)
      const sampled = sampleData(data, 100)

      expect(sampled.length).toBeLessThanOrEqual(101) // maxPoints + 마지막 포인트
      expect(sampled[0]).toBe(0) // 첫 번째 포인트 포함
      expect(sampled[sampled.length - 1]).toBe(999) // 마지막 포인트 포함
    })

    it('샘플링 간격이 올바르게 계산된다', () => {
      const data = Array.from({ length: 500 }, (_, i) => i)
      const sampled = sampleData(data, 100)

      // 간격은 Math.ceil(500 / 100) = 5
      expect(sampled[1]).toBe(5)
      expect(sampled[2]).toBe(10)
    })

    it('기본 maxPoints는 200이다', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i)
      const sampled = sampleData(data)

      expect(sampled.length).toBeLessThanOrEqual(201)
      expect(sampled[sampled.length - 1]).toBe(999)
    })

    it('마지막 포인트가 항상 포함된다', () => {
      const data = Array.from({ length: 347 }, (_, i) => ({ value: i }))
      const sampled = sampleData(data, 100)

      expect(sampled[sampled.length - 1]).toEqual({ value: 346 })
    })

    it('객체 배열도 샘플링할 수 있다', () => {
      const data = Array.from({ length: 500 }, (_, i) => ({
        date: `2025-${i}`,
        value: i * 10
      }))
      const sampled = sampleData(data, 50)

      expect(sampled.length).toBeLessThanOrEqual(51)
      expect(sampled[0]).toEqual({ date: '2025-0', value: 0 })
      expect(sampled[sampled.length - 1]).toEqual({ date: '2025-499', value: 4990 })
    })
  })

  describe('measureChartPerformance', () => {
    let consoleLogSpy
    let consoleWarnSpy
    const originalEnv = process.env.NODE_ENV

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleLogSpy.mockRestore()
      consoleWarnSpy.mockRestore()
      process.env.NODE_ENV = originalEnv
    })

    it('함수의 반환값을 그대로 반환한다', () => {
      const fn = () => 'test result'
      const result = measureChartPerformance('Test', fn)

      expect(result).toBe('test result')
    })

    it('개발 환경에서 성능을 측정한다', () => {
      process.env.NODE_ENV = 'development'

      const fn = () => 'test'
      measureChartPerformance('Test Label', fn)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Chart Performance] Test Label:')
      )
    })

    it('프로덕션 환경에서는 성능 측정을 하지 않는다', () => {
      process.env.NODE_ENV = 'production'

      const fn = () => 'test'
      measureChartPerformance('Test Label', fn)

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('500ms 이상 걸리면 경고를 출력한다', () => {
      process.env.NODE_ENV = 'development'

      const slowFn = () => {
        // 성능 측정을 위해 의도적으로 느린 함수
        const start = Date.now()
        while (Date.now() - start < 600) {
          // 600ms 대기
        }
        return 'done'
      }

      measureChartPerformance('Slow Operation', slowFn)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Chart Performance] ⚠️ Slow Operation took longer than 500ms')
      )
    })

    it('에러가 발생해도 전파된다', () => {
      process.env.NODE_ENV = 'development'

      const errorFn = () => {
        throw new Error('Test error')
      }

      expect(() => measureChartPerformance('Error Test', errorFn)).toThrow('Test error')
    })
  })

  describe('validateChartData', () => {
    it('데이터가 없으면 에러를 반환한다', () => {
      const result = validateChartData(null)

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('데이터가 없습니다')
    })

    it('데이터가 배열이 아니면 에러를 반환한다', () => {
      const result = validateChartData('not an array')

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('배열이 아님')
    })

    it('빈 배열이면 에러를 반환한다', () => {
      const result = validateChartData([])

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('데이터가 비어있습니다')
    })

    it('유효한 데이터면 true를 반환한다', () => {
      const data = [{ value: 1 }, { value: 2 }]
      const result = validateChartData(data)

      expect(result.isValid).toBe(true)
      expect(result.error).toBeNull()
    })

    it('필수 필드가 있는지 검증한다', () => {
      const data = [{ date: '2025-11-01', value: 100 }]
      const result = validateChartData(data, ['date', 'value'])

      expect(result.isValid).toBe(true)
      expect(result.error).toBeNull()
    })

    it('필수 필드가 누락되면 에러를 반환한다', () => {
      const data = [{ date: '2025-11-01' }]
      const result = validateChartData(data, ['date', 'value', 'volume'])

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('필수 필드가 누락되었습니다')
      expect(result.error).toContain('value')
      expect(result.error).toContain('volume')
    })

    it('필수 필드가 지정되지 않으면 필드 검증을 건너뛴다', () => {
      const data = [{ anyField: 'anyValue' }]
      const result = validateChartData(data, [])

      expect(result.isValid).toBe(true)
    })

    it('여러 객체가 있어도 첫 번째 객체만 검증한다', () => {
      const data = [
        { date: '2025-11-01', value: 100 },
        { date: '2025-11-02' }, // value 누락
      ]
      const result = validateChartData(data, ['date', 'value'])

      // 첫 번째 객체만 검증하므로 통과
      expect(result.isValid).toBe(true)
    })
  })

  describe('getResponsiveChartHeight', () => {
    it('모바일 화면(< 768px)에서는 250px을 반환한다', () => {
      expect(getResponsiveChartHeight(320)).toBe(250)
      expect(getResponsiveChartHeight(480)).toBe(250)
      expect(getResponsiveChartHeight(767)).toBe(250)
    })

    it('태블릿 화면(768px ~ 1023px)에서는 350px을 반환한다', () => {
      expect(getResponsiveChartHeight(768)).toBe(350)
      expect(getResponsiveChartHeight(900)).toBe(350)
      expect(getResponsiveChartHeight(1023)).toBe(350)
    })

    it('데스크톱 화면(>= 1024px)에서는 450px을 반환한다', () => {
      expect(getResponsiveChartHeight(1024)).toBe(450)
      expect(getResponsiveChartHeight(1440)).toBe(450)
      expect(getResponsiveChartHeight(1920)).toBe(450)
    })

    it('경계값을 올바르게 처리한다', () => {
      expect(getResponsiveChartHeight(767)).toBe(250) // 모바일
      expect(getResponsiveChartHeight(768)).toBe(350) // 태블릿
      expect(getResponsiveChartHeight(1023)).toBe(350) // 태블릿
      expect(getResponsiveChartHeight(1024)).toBe(450) // 데스크톱
    })

    it('0 또는 음수 입력도 처리한다', () => {
      expect(getResponsiveChartHeight(0)).toBe(250)
      expect(getResponsiveChartHeight(-100)).toBe(250)
    })

    it('매우 큰 화면도 처리한다', () => {
      expect(getResponsiveChartHeight(4000)).toBe(450)
      expect(getResponsiveChartHeight(10000)).toBe(450)
    })
  })
})
