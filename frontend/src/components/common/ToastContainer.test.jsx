import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToastProvider } from '../../contexts/ToastContext'
import ToastContainer from './ToastContainer'
import Toast from './Toast'

// Mock Toast 컴포넌트
vi.mock('./Toast', () => ({
  default: ({ id, message, type }) => (
    <div data-testid={`toast-${id}`}>
      {message} ({type})
    </div>
  )
}))

// Mock useToast
const mockToasts = []
vi.mock('../../contexts/ToastContext', async () => {
  const actual = await vi.importActual('../../contexts/ToastContext')
  return {
    ...actual,
    useToast: () => ({
      toasts: mockToasts
    })
  }
})

describe('ToastContainer', () => {
  it('토스트가 없으면 아무것도 렌더링하지 않는다', () => {
    mockToasts.length = 0

    const { container } = render(<ToastContainer />)

    expect(container.firstChild).toBeNull()
  })

  it('aria-live 속성이 설정되어 있다', () => {
    mockToasts.length = 0
    mockToasts.push({ id: 1, message: 'Test', type: 'info', duration: 3000 })

    const { container } = render(<ToastContainer />)

    const toastContainer = container.querySelector('[aria-live="polite"]')
    expect(toastContainer).toBeInTheDocument()
    expect(toastContainer).toHaveAttribute('aria-atomic', 'true')
  })

  it('올바른 위치 스타일이 적용되어 있다', () => {
    mockToasts.length = 0
    mockToasts.push({ id: 1, message: 'Test', type: 'info', duration: 3000 })

    const { container } = render(<ToastContainer />)

    const toastContainer = container.querySelector('.fixed')
    expect(toastContainer).toHaveClass('top-4', 'right-4', 'z-50')
  })
})
