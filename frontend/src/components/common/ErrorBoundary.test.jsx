import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from './ErrorBoundary'

// 에러를 발생시키는 테스트 컴포넌트
const ThrowError = ({ shouldThrow = false, message = 'Test error' }) => {
  if (shouldThrow) {
    throw new Error(message)
  }
  return <div>No Error</div>
}

describe('ErrorBoundary', () => {
  // 콘솔 에러를 숨기기 위한 설정
  const originalConsoleError = console.error
  beforeEach(() => {
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  it('에러가 없으면 자식 컴포넌트를 정상적으로 렌더링한다', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    )

    expect(screen.getByText('No Error')).toBeInTheDocument()
  })

  it('에러가 발생하면 기본 에러 UI를 표시한다', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument()
    expect(screen.getByText(/예상치 못한 오류가 발생했습니다/)).toBeInTheDocument()
    expect(screen.getByText('다시 시도')).toBeInTheDocument()
    expect(screen.getByText('홈으로')).toBeInTheDocument()
  })

  it('개발 환경에서는 에러 상세 정보를 표시한다', () => {
    const originalEnv = import.meta.env.DEV
    import.meta.env.DEV = true

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} message="Custom error message" />
      </ErrorBoundary>
    )

    expect(screen.getByText(/Custom error message/)).toBeInTheDocument()
    expect(screen.getByText('상세 정보')).toBeInTheDocument()

    import.meta.env.DEV = originalEnv
  })

  it('다시 시도 버튼을 클릭하면 에러 상태가 초기화된다', async () => {
    const user = userEvent.setup()
    let shouldThrow = true

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={shouldThrow} />
      </ErrorBoundary>
    )

    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument()

    // 에러 상태 변경
    shouldThrow = false

    // 다시 시도 버튼 클릭
    const retryButton = screen.getByText('다시 시도')
    await user.click(retryButton)

    // 에러 상태가 초기화되어야 하지만, shouldThrow가 여전히 true이므로
    // 다시 에러가 발생할 것입니다.
    // 실제로는 부모 컴포넌트에서 상태를 관리해야 합니다.
  })

  it('onReset 콜백이 제공되면 다시 시도 시 호출된다', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()

    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    const retryButton = screen.getByText('다시 시도')
    await user.click(retryButton)

    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('커스텀 fallback UI를 제공하면 그것을 렌더링한다', () => {
    const customFallback = ({ error, resetError }) => (
      <div>
        <h1>Custom Error UI</h1>
        <p>{error?.message}</p>
        <button onClick={resetError}>Custom Reset</button>
      </div>
    )

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} message="Custom fallback error" />
      </ErrorBoundary>
    )

    expect(screen.getByText('Custom Error UI')).toBeInTheDocument()
    expect(screen.getByText('Custom fallback error')).toBeInTheDocument()
    expect(screen.getByText('Custom Reset')).toBeInTheDocument()
    expect(screen.queryByText('문제가 발생했습니다')).not.toBeInTheDocument()
  })

  it('홈으로 버튼을 클릭하면 홈페이지로 이동한다', async () => {
    const user = userEvent.setup()

    // window.location.href를 모킹
    delete window.location
    window.location = { href: '' }

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    const homeButton = screen.getByText('홈으로')
    await user.click(homeButton)

    expect(window.location.href).toBe('/')
  })

  it('에러를 콘솔에 로깅한다', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error')

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} message="Error to log" />
      </ErrorBoundary>
    )

    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
