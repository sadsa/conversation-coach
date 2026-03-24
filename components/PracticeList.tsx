// components/PracticeList.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { useSwipeable } from 'react-swipeable'
import type { PracticeItem, AnnotationType, SubCategory } from '@/lib/types'
import { Modal } from '@/components/Modal'
import { TYPE_LABEL } from '@/components/AnnotationCard'

const TYPE_DOT_CLASS: Record<AnnotationType, string> = {
  grammar: 'bg-red-400',
  naturalness: 'bg-yellow-400',
}

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
  onDelete: (id: string) => Promise<boolean>
  onOpen: (item: PracticeItem) => void
}) {
  const [translateX, setTranslateX] = useState(0)
  const [rowHeight, setRowHeight] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  async function triggerDelete() {
    if (isAnimating || !rowRef.current) return
    setIsAnimating(true)

    // Phase 1: slide item fully off-screen left (200ms)
    setTranslateX(-window.innerWidth)

    // Fire DELETE in parallel
    const deletePromise = onDelete(item.id)

    // Wait for slide-out animation
    await new Promise(r => setTimeout(r, 200))
    if (!mountedRef.current) return

    // Phase 2: measure height, then collapse row
    const h = rowRef.current?.offsetHeight ?? 0
    setRowHeight(h)
    // Double rAF ensures the explicit height is painted before we transition to 0
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    if (!mountedRef.current) return
    setRowHeight(0)

    // Wait for both collapse animation and DELETE to finish
    const [, deleteResult] = await Promise.allSettled([
      new Promise(r => setTimeout(r, 200)),
      deletePromise,
    ])
    if (!mountedRef.current) return

    const succeeded = deleteResult.status === 'fulfilled' && deleteResult.value === true

    if (!succeeded) {
      // Restore item on failure
      setRowHeight(null)
      setTranslateX(0)
      setIsAnimating(false)
    }
    // On success: parent removes item from list via onDeleted (called inside onDelete)
  }

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
      if (e.absX > 80) triggerDelete()
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
    <li
      ref={rowRef}
      className="relative overflow-hidden rounded-xl"
      style={
        rowHeight !== null
          ? { height: rowHeight, transition: 'height 0.2s ease', overflow: 'hidden' }
          : undefined
      }
    >
      {/* Swipe-to-delete background */}
      <div className="absolute inset-0 bg-red-600 flex items-center justify-end pr-5 rounded-xl">
        <span className="text-white text-sm font-medium">Delete</span>
      </div>
      {/* Item card */}
      <div
        {...handlers}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating
            ? 'transform 0.2s ease'
            : translateX === 0
            ? 'transform 0.2s'
            : 'none',
          userSelect: 'none',
          touchAction: 'pan-y',
        }}
        className="relative flex items-center gap-3 px-4 py-3 bg-gray-900 rounded-xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={() => {
          if (isBulkMode) {
            onToggleSelect(item.id)
          } else if (translateX === 0) {
            onOpen(item)
          }
        }}
      >
        {/* Hidden test seam for triggering delete in tests */}
        <button
          data-testid={`delete-item-${item.id}`}
          className="sr-only"
          onClick={e => { e.stopPropagation(); triggerDelete() }}
          tabIndex={-1}
          aria-hidden="true"
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — inert is a valid HTML attribute not yet in React's types
          inert=""
        />
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
          <>
            <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
              {item.original}
            </span>
            {' → '}
            <span className="font-medium text-[#86efac]">{item.correction}</span>
          </>
        </div>
      </div>
    </li>
  )
}

interface Props {
  items: PracticeItem[]
  /** Called after successful API delete so the parent can update `items`. */
  onDeleted?: (ids: string[]) => void
  initialSubCategory?: SubCategory
}

export function PracticeList({ items, onDeleted, initialSubCategory }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [subCategoryFilter, setSubCategoryFilter] = useState<SubCategory | null>(initialSubCategory ?? null)
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [openItem, setOpenItem] = useState<PracticeItem | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(t)
  }, [toastMessage])

  const filtered = items.filter(item => {
    if (subCategoryFilter !== null && item.sub_category !== subCategoryFilter) return false
    return true
  })

  async function deleteItem(id: string): Promise<boolean> {
    const res = await fetch(`/api/practice-items/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setToastMessage("Couldn't delete item — try again.")
      return false
    }
    onDeleted?.([id])
    return true
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
    const results = await Promise.allSettled(
      ids.map(id => fetch(`/api/practice-items/${id}`, { method: 'DELETE' }))
    )
    const succeeded = results
      .map((r, i) => ({ r, id: ids[i] }))
      .filter(({ r }) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<Response>).value.ok)
      .map(({ id }) => id)
    if (succeeded.length < ids.length) {
      setToastMessage("Some items couldn't be deleted — try again.")
    }
    if (succeeded.length > 0) {
      onDeleted?.(succeeded)
    }
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
              <>
                <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
                  {openItem.original}
                </span>
                <span className="mx-2 text-gray-400">→</span>
                <span className="font-medium text-[#86efac]">{openItem.correction}</span>
              </>
            </div>
            <p className="text-gray-300 leading-relaxed">{openItem.explanation}</p>
          </div>
        </Modal>
      )}

      {toastMessage && (
        <div
          role="alert"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  )
}
