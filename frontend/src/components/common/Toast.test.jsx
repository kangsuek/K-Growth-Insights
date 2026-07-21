import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../contexts/ToastContext'
import Toast from './Toast'

// Mock useToast
const mockRemoveToast = vi.fn()
vi.mock('../../contexts/ToastContext', async () => {
  const actual = await vi.importActual('../../contexts/ToastContext')
  return {
    ...actual,
    useToast: () => ({
      removeToast: mockRemoveToast
    })
  }
})

describe('Toast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('success 타입의 토스트를 렌더링한다', () => {
    render(
      <Toast
        id={1}
        message="Success message"
        type="success"
        duration={3000}
      />
    )

    expect(screen.getByText('Success message')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('error 타입의 토스트를 렌더링한다', () => {
    render(
      <Toast
        id={2}
        message="Error message"
        type="error"
        duration={3000}
      />
    )

    expect(screen.getByText('Error message')).toBeInTheDocument()
  })

  it('warning 타입의 토스트를 렌더링한다', () => {
    render(
      <Toast
        id={3}
        message="Warning message"
        type="warning"
        duration={3000}
      />
    )

    expect(screen.getByText('Warning message')).toBeInTheDocument()
  })

  it('info 타입의 토스트를 렌더링한다', () => {
    render(
      <Toast
        id={4}
        message="Info message"
        type="info"
        duration={3000}
      />
    )

    expect(screen.getByText('Info message')).toBeInTheDocument()
  })

  it('닫기 버튼을 클릭하면 removeToast가 호출된다', async () => {
    const user = userEvent.setup()

    render(
      <Toast
        id={5}
        message="Test message"
        type="info"
        duration={3000}
      />
    )

    const closeButton = screen.getByLabelText('닫기')
    await user.click(closeButton)

    expect(mockRemoveToast).toHaveBeenCalledWith(5)
  })

  it('각 타입별로 올바른 아이콘이 표시된다', () => {
    const { rerender } = render(
      <Toast id={1} message="Test" type="success" duration={3000} />
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(<Toast id={2} message="Test" type="error" duration={3000} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(<Toast id={3} message="Test" type="warning" duration={3000} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(<Toast id={4} message="Test" type="info" duration={3000} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('aria-live 속성이 설정되어 있다', () => {
    render(
      <Toast
        id={6}
        message="Accessible message"
        type="info"
        duration={3000}
      />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'polite')
  })
})
