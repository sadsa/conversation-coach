// components/PracticeList.tsx
'use client'
import { useState, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import type { PracticeItem, AnnotationType } from '@/lib/types'
import { Modal } from '@/components/Modal'
import { TYPE_LABEL } from '@/components/AnnotationCard'

const TYPE_DOT_CLASS: Record<AnnotationType, string> = {
  grammar: 'bg-red-400',
  naturalness: 'bg-yellow-400',
  strength: 'bg-green-400',
}

type Filter = 'all' | AnnotationType

function SwipeableItem({
  item,
  isBulkMode,
  isSelected,
  onToggleSelect,
  onDelete,
  onOpen,
}: {
  item: PracticeItem
  isBulkMode: boolean
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onDelete: (id: string) => void
  onOpen: (item: PracticeItem) => void
}) {
  const [translateX, setTranslateX] = useState(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlers = useSwipeable({
    delta: 10,
    onSwiping: (e) => {
      // Cancel long-press if swiping
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      if (e.dir === 'Left') setTranslateX(-e.absX)
      else setTranslateX(0)
    },
    onSwipedLeft: (e) => {
      if (e.absX > 80) onDelete(item.id)
      else setTranslateX(0)
    },
    onSwipedRight: () => setTranslateX(0),
    trackMouse: false,
  })

  function handleTouchStart() {
    if (isBulkMode) return
    longPressTimer.current = setTimeout(() => {
      onToggleSelect(item.id)
    }, 300)
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  return (
    <li className="relative overflow-hidden rounded-xl">
      {/* Swipe-to-delete background */}
      <div className="absolute inset-0 bg-red-600 flex items-center justify-end pr-5 rounded-xl">
        <span className="text-white text-sm font-medium">Delete</span>
      </div>
      {/* Item card */}
      <div
        {...handlers}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: translateX === 0 ? 'transform 0.2s' : 'none',
          userSelect: 'none',
          touchAction: 'pan-y',
        }}
        className="relative flex items-center gap-3 px-4 py-3 bg-gray-900 rounded-xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (isBulkMode) {
            onToggleSelect(item.id)
          } else if (translateX === 0) {
            onOpen(item)
          }
        }}
      >
        {/* Bulk-select checkbox — always on desktop, only in bulk mode on mobile */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item.id)}
          onClick={e => e.stopPropagation()}
          className={`w-4 h-4 rounded accent-violet-500 flex-shrink-0 ${isBulkMode ? 'block' : 'hidden sm:block'}`}
          aria-label="Select item"
        />
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_DOT_CLASS[item.type]}`} />
        <div className="flex-1 min-w-0 text-sm">
          {item.correction ? (
            <>
              <span className="line-through text-gray-500">{item.original}</span>
              {' → '}
              <span className="font-medium">{item.correction}</span>
            </>
          ) : (
            <span className="text-green-300">&ldquo;{item.original}&rdquo;</span>
          )}
        </div>
      </div>
    </li>
  )
}

interface Props {
  items: PracticeItem[]
  /** Called after successful API delete so the parent can update `items`. */
  onDeleted?: (ids: string[]) => void
}

export function PracticeList({ items, onDeleted }: Props) {
  const [typeFilter, setTypeFilter] = useState<Filter>('all')
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [openItem, setOpenItem] = useState<PracticeItem | null>(null)

  const filtered = items.filter(item =>
    typeFilter === 'all' || item.type === typeFilter
  )

  async function deleteItem(id: string) {
    await fetch(`/api/practice-items/${id}`, { method: 'DELETE' })
    onDeleted?.([id])
  }

  function handleToggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    if (!isBulkMode) setIsBulkMode(true)
  }

  function exitBulkMode() {
    setIsBulkMode(false)
    setSelectedIds(new Set())
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds)
    await Promise.allSettled(ids.map(id => fetch(`/api/practice-items/${id}`, { method: 'DELETE' })))
    onDeleted?.(ids)
    exitBulkMode()
  }

  return (
    <div className="space-y-4">
      {/* Bulk action toolbar — sticky, shown only in bulk mode */}
      {isBulkMode && (
        <div className="sticky top-0 z-30 flex items-center gap-3 px-3 py-2 bg-indigo-950 border border-indigo-800 rounded-xl text-sm">
          {/* Back / exit button */}
          <button
            onClick={exitBulkMode}
            aria-label="Exit selection mode"
            className="text-indigo-300 hover:text-indigo-100 p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="w-5 h-5" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <span className="text-indigo-300 text-sm flex-1">{selectedIds.size} selected</span>

          {/* Select all */}
          <button
            onClick={() => setSelectedIds(new Set(filtered.map(i => i.id)))}
            aria-label="Select all"
            className="text-indigo-400 hover:text-indigo-200 p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="w-5 h-5" aria-hidden="true">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </button>

          {/* Delete */}
          <button
            onClick={deleteSelected}
            aria-label={`Delete ${selectedIds.size} selected items`}
            disabled={selectedIds.size === 0}
            className="text-red-400 hover:text-red-300 disabled:opacity-40 p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="w-5 h-5" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      )}

      {/* Filter row — hidden while in bulk mode */}
      {!isBulkMode && (
        <div className="flex gap-2 flex-wrap text-sm">
          {(['all', 'grammar', 'naturalness', 'strength'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-3 py-1 rounded-full border transition-colors capitalize ${
                typeFilter === f
                  ? 'border-violet-500 text-violet-300 bg-violet-500/10'
                  : 'border-gray-700 text-gray-400'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-gray-500 text-sm">No items match this filter.</p>
      )}

      <ul className="space-y-2">
        {filtered.map(item => (
          <SwipeableItem
            key={item.id}
            item={item}
            isBulkMode={isBulkMode}
            isSelected={selectedIds.has(item.id)}
            onToggleSelect={handleToggleSelect}
            onDelete={deleteItem}
            onOpen={setOpenItem}
          />
        ))}
      </ul>

      {openItem && (
        <Modal
          title={TYPE_LABEL[openItem.type]}
          onClose={() => setOpenItem(null)}
        >
          <div className="space-y-3 text-sm">
            <div>
              {openItem.correction ? (
                <>
                  <span className="line-through text-gray-500">{openItem.original}</span>
                  <span className="mx-2 text-gray-500">→</span>
                  <span className="font-medium text-green-300">{openItem.correction}</span>
                </>
              ) : (
                <span className="text-green-300">&ldquo;{openItem.original}&rdquo;</span>
              )}
            </div>
            <p className="text-gray-300 leading-relaxed">{openItem.explanation}</p>
          </div>
        </Modal>
      )}
    </div>
  )
}
