import PropTypes from 'prop-types'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, useMemo, memo } from 'react'
import ETFCard from '../etf/ETFCard'

/**
 * 드래그 가능한 카드 래퍼 컴포넌트
 */
const SortableCard = memo(function SortableCard({ etf, summary, onContextMenu }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: etf.ticker })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(e.clientX, e.clientY, etf.ticker, etf.name)
      }}
      {...attributes}
      {...listeners}
    >
      {/* 드래그 핸들 표시 */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="bg-gray-200 dark:bg-gray-700 rounded p-1 shadow-sm">
          <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>
      </div>

      <ETFCard
        etf={etf}
        summary={summary}
      />
    </div>
  )
})

SortableCard.propTypes = {
  etf: PropTypes.object.isRequired,
  summary: PropTypes.object,
  onContextMenu: PropTypes.func,
}

/**
 * ETFCardGrid 컴포넌트
 * 대시보드의 ETF 카드 그리드 레이아웃 (드래그 앤 드롭 지원)
 *
 * @param {Object} props
 * @param {Array} props.etfs - ETF 배열
 * @param {Object} props.batchSummary - 배치 요약 데이터 (ticker를 키로 하는 객체)
 * @param {Function} props.onOrderChange - 순서 변경 콜백 함수
 * @param {Function} props.onContextMenu - 카드 우클릭 콜백 (x, y, ticker, name)
 */
export default function ETFCardGrid({ etfs, batchSummary, onOrderChange, onContextMenu }) {
  const [activeId, setActiveId] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px 이동 후 드래그 시작 (클릭과 구분)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event) => {
    setActiveId(event.active.id)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = etfs.findIndex((etf) => etf.ticker === active.id)
      const newIndex = etfs.findIndex((etf) => etf.ticker === over.id)

      const newOrder = arrayMove(etfs, oldIndex, newIndex)
      onOrderChange?.(newOrder.map(etf => etf.ticker))
    }

    setActiveId(null)
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  // 현재 드래그 중인 ETF 찾기
  const activeETF = useMemo(() => etfs.find((etf) => etf.ticker === activeId), [etfs, activeId])

  // SortableContext items 배열 메모이제이션
  const sortableItems = useMemo(() => etfs.map(etf => etf.ticker), [etfs])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={sortableItems} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {etfs.map((etf) => (
            <SortableCard
              key={etf.ticker}
              etf={etf}
              summary={batchSummary?.[etf.ticker]}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeETF ? (
          <div className="cursor-grabbing opacity-90">
            <ETFCard
              etf={activeETF}
              summary={batchSummary?.[activeETF.ticker]}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

ETFCardGrid.propTypes = {
  etfs: PropTypes.arrayOf(
    PropTypes.shape({
      ticker: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      type: PropTypes.oneOf(['ETF', 'STOCK', 'ALL']).isRequired,
      theme: PropTypes.string,
      purchase_date: PropTypes.string,
    })
  ).isRequired,
  batchSummary: PropTypes.object,  // {ticker: {latest_price, prices, weekly_return, ...}}
  onOrderChange: PropTypes.func,
  onContextMenu: PropTypes.func,
}

