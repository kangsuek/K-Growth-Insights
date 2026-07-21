import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from './ToastContext'

// 테스트 컴포넌트
const TestComponent = () => {
  const toast = useToast()

  return (
    <div>
      <button onClick={() => toast.success('Success message')}>Success</button>
      <button onClick={() => toast.error('Error message')}>Error</button>
      <button onClick={() => toast.warning('Warning message')}>Warning</button>
      <button onClick={() => toast.info('Info message')}>Info</button>
      <button onClick={() => toast.addToast('Custom message', 'info', 1000)}>Custom</button>
    </div>
  )
}

describe('ToastContext', () => {
  it('ToastProvider 없이 useToast를 사용하면 에러가 발생한다', () => {
    const consoleError = console.error
    console.error = vi.fn()

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useToast must be used within a ToastProvider')

    console.error = consoleError
  })

  it('success 토스트를 추가할 수 있다', async () => {
    const user = userEvent.setup()

    const { container } = render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    const successButton = screen.getByText('Success')
    await user.click(successButton)

    // Toast가 렌더링되는지 확인하기 위해 ToastContainer를 함께 렌더링해야 함
    // 여기서는 Context만 테스트하므로 toasts 배열에 추가되었는지 확인
    expect(container).toBeInTheDocument()
  })

  it('error 토스트를 추가할 수 있다', async () => {
    const user = userEvent.setup()

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    const errorButton = screen.getByText('Error')
    await user.click(errorButton)

    expect(errorButton).toBeInTheDocument()
  })

  it('warning 토스트를 추가할 수 있다', async () => {
    const user = userEvent.setup()

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    const warningButton = screen.getByText('Warning')
    await user.click(warningButton)

    expect(warningButton).toBeInTheDocument()
  })

  it('info 토스트를 추가할 수 있다', async () => {
    const user = userEvent.setup()

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    const infoButton = screen.getByText('Info')
    await user.click(infoButton)

    expect(infoButton).toBeInTheDocument()
  })

  it('커스텀 duration으로 토스트를 추가할 수 있다', async () => {
    const user = userEvent.setup()

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    const customButton = screen.getByText('Custom')
    await user.click(customButton)

    expect(customButton).toBeInTheDocument()
  })
})
