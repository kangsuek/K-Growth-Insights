import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardFilters from './DashboardFilters'

describe('DashboardFilters', () => {
  const defaultProps = {
    sortBy: 'type',
    sortDirection: 'asc',
    onSortChange: vi.fn(),
  }

  it('정렬 버튼들을 표시한다', () => {
    render(<DashboardFilters {...defaultProps} />)

    expect(screen.getByText('타입')).toBeInTheDocument()
    expect(screen.getByText('이름')).toBeInTheDocument()
    expect(screen.getByText('테마')).toBeInTheDocument()
  })

  it('현재 정렬 기준을 하이라이트한다', () => {
    render(<DashboardFilters {...defaultProps} sortBy="name" />)

    const nameButton = screen.getByText('이름').closest('button')
    expect(nameButton).toHaveClass('bg-primary-500')
  })

  it('정렬 방향 아이콘을 표시한다', () => {
    render(<DashboardFilters {...defaultProps} sortBy="type" sortDirection="asc" />)

    const typeButton = screen.getByText('타입').closest('button')
    expect(typeButton).toContainHTML('svg')
  })

  it('정렬 버튼 클릭 시 onSortChange를 호출한다', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()

    render(<DashboardFilters {...defaultProps} onSortChange={onSortChange} />)

    await user.click(screen.getByText('이름'))

    expect(onSortChange).toHaveBeenCalledWith('name')
  })

  it('같은 정렬 기준을 클릭하면 방향이 전환된다', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()

    render(<DashboardFilters {...defaultProps} sortBy="type" onSortChange={onSortChange} />)

    await user.click(screen.getByText('타입'))

    expect(onSortChange).toHaveBeenCalledWith('type')
  })
})

