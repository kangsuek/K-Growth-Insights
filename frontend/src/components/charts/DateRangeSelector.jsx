import { useState, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import { subDays, subMonths, subYears, startOfYear, format } from 'date-fns';
import { validateDateRange } from '../../utils/validation';
import { MAX_DATE_RANGE_DAYS } from '../../constants';

/**
 * DateRangeSelector - 차트 데이터 기간 선택 컴포넌트
 *
 * @param {Object} props
 * @param {Function} props.onDateRangeChange - 날짜 범위 변경 콜백 함수
 * @param {string} props.defaultRange - 기본 범위 ('7d', '1m', '3m', 'custom')
 */
const DateRangeSelector = memo(function DateRangeSelector({ 
  onDateRangeChange, 
  defaultRange = '7d',
  initialStartDate = null,
  initialEndDate = null
}) {
  const [selectedRange, setSelectedRange] = useState(defaultRange);
  const [startDate, setStartDate] = useState(initialStartDate || '');
  const [endDate, setEndDate] = useState(initialEndDate || '');
  const [error, setError] = useState('');

  // 프리셋 버튼 클릭 핸들러
  const handlePresetClick = (range) => {
    setSelectedRange(range);
    setError('');

    const today = new Date();
    let calculatedStartDate;

    switch (range) {
      case '7d':
        calculatedStartDate = subDays(today, 7);
        break;
      case '1m':
        calculatedStartDate = subMonths(today, 1);
        break;
      case '3m':
        calculatedStartDate = subMonths(today, 3);
        break;
      case '6m':
        calculatedStartDate = subMonths(today, 6);
        break;
      case 'ytd':
        calculatedStartDate = startOfYear(today);
        break;
      case '1y':
        calculatedStartDate = subYears(today, 1);
        break;
      default:
        return;
    }

    const formattedStartDate = format(calculatedStartDate, 'yyyy-MM-dd');
    const formattedEndDate = format(today, 'yyyy-MM-dd');

    setStartDate(formattedStartDate);
    setEndDate(formattedEndDate);

    onDateRangeChange({
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      range
    });
  };

  // 커스텀 날짜 변경 핸들러
  const handleCustomDateChange = (type, value) => {
    if (type === 'start') {
      setStartDate(value);
    } else {
      setEndDate(value);
    }
  };

  // 커스텀 날짜 적용
  const applyCustomRange = () => {
    // 날짜 범위 검증 (백엔드와 동일한 규칙 적용)
    const validation = validateDateRange(startDate, endDate);
    
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    setError('');
    setSelectedRange('custom');

    onDateRangeChange({
      startDate,
      endDate,
      range: 'custom'
    });
  };

  // 초기 기본값 설정 및 defaultRange prop 변경 시 반영
  useEffect(() => {
    // 초기 날짜가 이미 설정된 경우 (부모 컴포넌트에서 전달된 경우) 스킵
    if (initialStartDate && initialEndDate) {
      return;
    }
    
    // 커스텀 범위가 아닌 경우에만 자동으로 설정값 반영
    if (defaultRange !== 'custom') {
      handlePresetClick(defaultRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultRange, initialStartDate, initialEndDate]);

  const presetButtons = [
    { label: '7일', value: '7d' },
    { label: '1개월', value: '1m' },
    { label: '3개월', value: '3m' },
    { label: '6개월', value: '6m' },
    { label: 'YTD', value: 'ytd' },
    { label: '1년', value: '1y' },
    { label: '커스텀', value: 'custom' }
  ];

  return (
    <div className="date-range-selector bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4 transition-colors">
      {/* 프리셋 버튼 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {presetButtons.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => value === 'custom' ? setSelectedRange('custom') : handlePresetClick(value)}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              selectedRange === value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {/* 커스텀 날짜 선택기 */}
      {selectedRange === 'custom' && (
        <div className="border-t pt-4 mt-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                시작 날짜
              </label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => handleCustomDateChange('start', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                종료 날짜
              </label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => handleCustomDateChange('end', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <button
              onClick={applyCustomRange}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap"
              type="button"
            >
              적용
            </button>
          </div>

          {error && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* 현재 선택된 기간 표시 */}
      {startDate && endDate && selectedRange !== 'custom' && (
        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          선택된 기간: {startDate} ~ {endDate}
        </div>
      )}
    </div>
  );
})

DateRangeSelector.propTypes = {
  onDateRangeChange: PropTypes.func.isRequired,
  defaultRange: PropTypes.oneOf(['7d', '1m', '3m', '6m', 'ytd', '1y', 'custom']),
  initialStartDate: PropTypes.string,
  initialEndDate: PropTypes.string,
}

export default DateRangeSelector;
