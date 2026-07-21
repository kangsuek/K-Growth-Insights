import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format, subDays, subMonths } from 'date-fns';
import DateRangeSelector from './DateRangeSelector';

describe('DateRangeSelector', () => {
  it('프리셋 버튼들을 렌더링한다', () => {
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} />);

    expect(screen.getByRole('button', { name: '7일' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1개월' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3개월' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '커스텀' })).toBeInTheDocument();
  });

  it('기본값으로 7일 범위가 선택된다', async () => {
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="7d" />);

    // useEffect가 실행될 때까지 대기
    await waitFor(() => {
      expect(mockCallback).toHaveBeenCalled();
    });

    // 7일 버튼이 활성화되어 있는지 확인
    const button7d = screen.getByRole('button', { name: '7일' });
    expect(button7d).toHaveClass('bg-blue-600');
  });

  it('7일 버튼 클릭 시 올바른 날짜 범위를 계산한다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    const { rerender } = render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="1m" />);

    // 초기 렌더링 후 콜백 초기화
    mockCallback.mockClear();

    // 7일 버튼 클릭
    const button7d = screen.getByRole('button', { name: '7일' });
    await user.click(button7d);

    // 콜백이 올바른 인자로 호출되었는지 확인
    await waitFor(() => {
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          range: '7d',
          startDate: expect.any(String),
          endDate: expect.any(String),
        })
      );
    });

    // 날짜 계산 확인
    const today = new Date();
    const expectedStartDate = format(subDays(today, 7), 'yyyy-MM-dd');
    const expectedEndDate = format(today, 'yyyy-MM-dd');

    expect(mockCallback).toHaveBeenCalledWith({
      startDate: expectedStartDate,
      endDate: expectedEndDate,
      range: '7d',
    });
  });

  it('1개월 버튼 클릭 시 올바른 날짜 범위를 계산한다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="7d" />);

    // 초기 렌더링 후 콜백 초기화
    mockCallback.mockClear();

    // 1개월 버튼 클릭
    const button1m = screen.getByRole('button', { name: '1개월' });
    await user.click(button1m);

    // 콜백이 올바른 인자로 호출되었는지 확인
    await waitFor(() => {
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          range: '1m',
        })
      );
    });

    // 날짜 계산 확인
    const today = new Date();
    const expectedStartDate = format(subMonths(today, 1), 'yyyy-MM-dd');
    const expectedEndDate = format(today, 'yyyy-MM-dd');

    expect(mockCallback).toHaveBeenCalledWith({
      startDate: expectedStartDate,
      endDate: expectedEndDate,
      range: '1m',
    });
  });

  it('3개월 버튼 클릭 시 올바른 날짜 범위를 계산한다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="7d" />);

    // 초기 렌더링 후 콜백 초기화
    mockCallback.mockClear();

    // 3개월 버튼 클릭
    const button3m = screen.getByRole('button', { name: '3개월' });
    await user.click(button3m);

    // 콜백이 올바른 인자로 호출되었는지 확인
    await waitFor(() => {
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          range: '3m',
        })
      );
    });

    // 날짜 계산 확인
    const today = new Date();
    const expectedStartDate = format(subMonths(today, 3), 'yyyy-MM-dd');
    const expectedEndDate = format(today, 'yyyy-MM-dd');

    expect(mockCallback).toHaveBeenCalledWith({
      startDate: expectedStartDate,
      endDate: expectedEndDate,
      range: '3m',
    });
  });

  it('커스텀 버튼 클릭 시 날짜 입력 필드를 표시한다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="7d" />);

    // 커스텀 버튼 클릭
    const customButton = screen.getByRole('button', { name: '커스텀' });
    await user.click(customButton);

    // 날짜 입력 필드가 표시되는지 확인
    expect(screen.getByLabelText('시작 날짜')).toBeInTheDocument();
    expect(screen.getByLabelText('종료 날짜')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '적용' })).toBeInTheDocument();
  });

  it('커스텀 날짜 입력이 정상적으로 동작한다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="7d" />);

    // 커스텀 버튼 클릭
    const customButton = screen.getByRole('button', { name: '커스텀' });
    await user.click(customButton);

    // 날짜 입력
    const startDateInput = screen.getByLabelText('시작 날짜');
    const endDateInput = screen.getByLabelText('종료 날짜');

    await user.clear(startDateInput);
    await user.type(startDateInput, '2025-01-01');
    await user.clear(endDateInput);
    await user.type(endDateInput, '2025-01-31');

    // 초기 렌더링 후 콜백 초기화
    mockCallback.mockClear();

    // 적용 버튼 클릭
    const applyButton = screen.getByRole('button', { name: '적용' });
    await user.click(applyButton);

    // 콜백이 올바른 인자로 호출되었는지 확인
    expect(mockCallback).toHaveBeenCalledWith({
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      range: 'custom',
    });
  });

  it('시작 날짜가 종료 날짜보다 늦으면 에러 메시지를 표시한다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="7d" />);

    // 커스텀 버튼 클릭
    const customButton = screen.getByRole('button', { name: '커스텀' });
    await user.click(customButton);

    // 잘못된 날짜 입력 (시작 > 종료) - 과거 날짜 사용하여 미래 날짜 검증 회피
    const startDateInput = screen.getByLabelText('시작 날짜');
    const endDateInput = screen.getByLabelText('종료 날짜');

    // 과거 날짜로 설정하여 미래 날짜 검증을 피함
    const today = new Date();
    const pastDate1 = new Date(today);
    pastDate1.setDate(today.getDate() - 10);
    const pastDate2 = new Date(today);
    pastDate2.setDate(today.getDate() - 20);
    
    const startDateStr = pastDate1.toISOString().split('T')[0];
    const endDateStr = pastDate2.toISOString().split('T')[0]; // 시작일보다 이전

    await user.clear(startDateInput);
    await user.type(startDateInput, startDateStr);
    await user.clear(endDateInput);
    await user.type(endDateInput, endDateStr);

    // 초기 렌더링 후 콜백 초기화
    mockCallback.mockClear();

    // 적용 버튼 클릭
    const applyButton = screen.getByRole('button', { name: '적용' });
    await user.click(applyButton);

    // 에러 메시지가 표시되는지 확인
    expect(screen.getByText('시작 날짜는 종료 날짜보다 이전이어야 합니다.')).toBeInTheDocument();

    // 콜백이 호출되지 않았는지 확인
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('날짜 범위가 1년(365일)을 초과하면 에러 메시지를 표시한다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="7d" />);

    // 커스텀 버튼 클릭
    const customButton = screen.getByRole('button', { name: '커스텀' });
    await user.click(customButton);

    // 1년을 초과하는 날짜 입력
    const startDateInput = screen.getByLabelText('시작 날짜');
    const endDateInput = screen.getByLabelText('종료 날짜');

    await user.clear(startDateInput);
    await user.type(startDateInput, '2023-01-01');
    await user.clear(endDateInput);
    await user.type(endDateInput, '2025-01-01');

    // 초기 렌더링 후 콜백 초기화
    mockCallback.mockClear();

    // 적용 버튼 클릭
    const applyButton = screen.getByRole('button', { name: '적용' });
    await user.click(applyButton);

    // 에러 메시지가 표시되는지 확인
    expect(screen.getByText('최대 조회 기간은 365일(1년)입니다.')).toBeInTheDocument();

    // 콜백이 호출되지 않았는지 확인
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('날짜를 입력하지 않고 적용 버튼을 클릭하면 에러 메시지를 표시한다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="7d" />);

    // 커스텀 버튼 클릭
    const customButton = screen.getByRole('button', { name: '커스텀' });
    await user.click(customButton);

    // 날짜 입력 필드 초기화
    const startDateInput = screen.getByLabelText('시작 날짜');
    const endDateInput = screen.getByLabelText('종료 날짜');

    await user.clear(startDateInput);
    await user.clear(endDateInput);

    // 초기 렌더링 후 콜백 초기화
    mockCallback.mockClear();

    // 적용 버튼 클릭
    const applyButton = screen.getByRole('button', { name: '적용' });
    await user.click(applyButton);

    // 에러 메시지가 표시되는지 확인
    expect(screen.getByText('시작 날짜와 종료 날짜를 모두 입력해주세요.')).toBeInTheDocument();

    // 콜백이 호출되지 않았는지 확인
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('프리셋 버튼 클릭 시 선택된 날짜 범위를 표시한다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="1m" />);

    // 초기 렌더링 후 콜백 초기화
    mockCallback.mockClear();

    // 7일 버튼 클릭
    const button7d = screen.getByRole('button', { name: '7일' });
    await user.click(button7d);

    // 선택된 기간이 표시되는지 확인
    await waitFor(() => {
      expect(screen.getByText(/선택된 기간:/)).toBeInTheDocument();
    });
  });

  it('반응형 그리드 레이아웃을 사용한다', () => {
    const mockCallback = vi.fn();
    const { container } = render(<DateRangeSelector onDateRangeChange={mockCallback} />);

    // 그리드 레이아웃 확인
    const buttonGrid = container.querySelector('.grid');
    expect(buttonGrid).toHaveClass('grid-cols-2');
    expect(buttonGrid).toHaveClass('md:grid-cols-4');
  });

  it('프리셋 버튼의 활성/비활성 스타일이 올바르게 적용된다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="7d" />);

    // 7일 버튼이 활성화되어 있는지 확인
    await waitFor(() => {
      const button7d = screen.getByRole('button', { name: '7일' });
      expect(button7d).toHaveClass('bg-blue-600');
      expect(button7d).toHaveClass('text-white');
    });

    // 1개월 버튼이 비활성화되어 있는지 확인
    const button1m = screen.getByRole('button', { name: '1개월' });
    expect(button1m).toHaveClass('bg-gray-200');
    expect(button1m).toHaveClass('text-gray-700');

    // 1개월 버튼 클릭
    await user.click(button1m);

    // 1개월 버튼이 활성화되었는지 확인
    await waitFor(() => {
      expect(button1m).toHaveClass('bg-blue-600');
      expect(button1m).toHaveClass('text-white');
    });
  });

  it('유효한 커스텀 날짜 적용 후 에러 메시지가 사라진다', async () => {
    const user = userEvent.setup();
    const mockCallback = vi.fn();
    render(<DateRangeSelector onDateRangeChange={mockCallback} defaultRange="7d" />);

    // 커스텀 버튼 클릭
    const customButton = screen.getByRole('button', { name: '커스텀' });
    await user.click(customButton);

    // 잘못된 날짜 입력 (시작 > 종료)
    const startDateInput = screen.getByLabelText('시작 날짜');
    const endDateInput = screen.getByLabelText('종료 날짜');

    // 과거 날짜로 설정하여 미래 날짜 검증을 피함
    const today = new Date();
    const pastDate1 = new Date(today);
    pastDate1.setDate(today.getDate() - 10);
    const pastDate2 = new Date(today);
    pastDate2.setDate(today.getDate() - 20);
    
    const startDateStr = pastDate1.toISOString().split('T')[0];
    const endDateStr = pastDate2.toISOString().split('T')[0]; // 시작일보다 이전

    await user.clear(startDateInput);
    await user.type(startDateInput, startDateStr);
    await user.clear(endDateInput);
    await user.type(endDateInput, endDateStr);

    // 적용 버튼 클릭 (에러 발생)
    const applyButton = screen.getByRole('button', { name: '적용' });
    await user.click(applyButton);

    // 에러 메시지 확인
    expect(screen.getByText('시작 날짜는 종료 날짜보다 이전이어야 합니다.')).toBeInTheDocument();

    // 올바른 날짜로 수정 (과거 날짜 사용)
    const today2 = new Date();
    const pastDate3 = new Date(today2);
    pastDate3.setDate(today2.getDate() - 20);
    const pastDate4 = new Date(today2);
    pastDate4.setDate(today2.getDate() - 10);
    
    const correctStartDate = pastDate3.toISOString().split('T')[0];
    const correctEndDate = pastDate4.toISOString().split('T')[0];
    
    await user.clear(startDateInput);
    await user.type(startDateInput, correctStartDate);
    await user.clear(endDateInput);
    await user.type(endDateInput, correctEndDate);

    // 초기 렌더링 후 콜백 초기화
    mockCallback.mockClear();

    // 적용 버튼 클릭
    await user.click(applyButton);

    // 에러 메시지가 사라졌는지 확인
    await waitFor(() => {
      expect(screen.queryByText('시작 날짜는 종료 날짜보다 이전이어야 합니다.')).not.toBeInTheDocument();
    });

    // 콜백이 호출되었는지 확인
    expect(mockCallback).toHaveBeenCalledWith({
      startDate: correctStartDate,
      endDate: correctEndDate,
      range: 'custom',
    });
  });
});
