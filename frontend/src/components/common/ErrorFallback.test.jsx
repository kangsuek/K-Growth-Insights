import { describe, it, expect, vi } from 'vitest'
import { screen, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorFallback from './ErrorFallback'

describe('ErrorFallback', () => {
  it('에러 메시지를 표시한다', () => {
    const error = { message: '테스트 에러 메시지' }
    render(<ErrorFallback error={error} />)

    expect(screen.getByText('데이터를 불러오는데 실패했습니다')).toBeInTheDocument()
    expect(screen.getByText('테스트 에러 메시지')).toBeInTheDocument()
  })

  it('에러 메시지가 없을 때 기본 메시지를 표시한다', () => {
    render(<ErrorFallback error={null} />)

    expect(screen.getByText('데이터를 불러오는데 실패했습니다')).toBeInTheDocument()
    expect(screen.getByText('알 수 없는 오류가 발생했습니다')).toBeInTheDocument()
  })

  it('onRetry가 제공되면 다시 시도 버튼을 표시한다', () => {
    const onRetry = vi.fn()
    render(<ErrorFallback error={{ message: '에러' }} onRetry={onRetry} />)

    const retryButton = screen.getByText('다시 시도')
    expect(retryButton).toBeInTheDocument()
  })

  it('onRetry가 없으면 다시 시도 버튼을 표시하지 않는다', () => {
    render(<ErrorFallback error={{ message: '에러' }} />)

    expect(screen.queryByText('다시 시도')).not.toBeInTheDocument()
  })

  it('다시 시도 버튼을 클릭하면 onRetry가 호출된다', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ErrorFallback error={{ message: '에러' }} onRetry={onRetry} />)

    const retryButton = screen.getByText('다시 시도')
    await user.click(retryButton)

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

