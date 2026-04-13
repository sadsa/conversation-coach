// components/PracticeList.tsx
'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useSwipeable } from 'react-swipeable'
import type { PracticeItem, SubCategory } from '@/lib/types'
import { SUB_CATEGORIES } from '@/lib/types'
import { Modal } from '@/components/Modal'
import { useTranslation } from '@/components/LanguageProvider'

function importanceStars(score: number | null): string | null {
  if (score === 3) return '★★★'
  if (score === 2) return '★★☆'
  if (score === 1) return '★☆☆'
  return null
}

function SwipeableItem({
  item,
  isBulkMode,
  isSelected,
  onToggleSelect,
  onDelete,
  onMarkWritten,
  onOpen,
}: {
  item: PracticeItem
  isBulkMode: boolean
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onDelete: (id: string) => Promise<boolean>
  onMarkWritten: (id: string) => Promise<boolean>
  onOpen: (item: PracticeItem) => void
}) {
  const { t } = useTranslation()
  const [translateX, setTranslateX] = useState(0)
  const [rowHeight, setRowHeight] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isWrittenDown, setIsWrittenDown] = useState(item.written_down)
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

  async function triggerMarkWritten() {
    if (isAnimating) return
    setIsWrittenDown(true)
    setTranslateX(0)
    const ok = await onMarkWritten(item.id)
    if (!mountedRef.current) return
    if (!ok) setIsWrittenDown(false)
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
      else if (e.dir === 'Right') setTranslateX(e.absX)
      else setTranslateX(0)
    },
    onSwipedLeft: (e) => {
      if (e.absX > 80) triggerDelete()
      else setTranslateX(0)
    },
    onSwipedRight: (e) => {
      if (e.absX > 80 && !isWrittenDown) triggerMarkWritten()
      else setTranslateX(0)
    },
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
      {/* Swipe-to-delete background (right side, swiping left) */}
      <div className={`absolute inset-0 bg-red-600 flex items-center justify-end pr-5 rounded-xl ${translateX >= 0 ? 'invisible' : ''}`}>
        <span className="text-white text-sm font-medium">{t('session.delete')}</span>
      </div>
      {/* Swipe-to-written background (left side, swiping right) */}
      <div className={`absolute inset-0 bg-green-800 flex items-center pl-5 rounded-xl ${translateX <= 0 ? 'invisible' : ''}`}>
        <span className="text-white text-sm font-medium">{t('practiceList.revealWritten')}</span>
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
        className={`relative flex items-start gap-3 px-4 py-3 bg-surface rounded-xl ${isWrittenDown ? 'opacity-60' : ''}`}
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
        {/* Hidden test seam for triggering mark-written in tests */}
        <button
          data-testid={`write-item-${item.id}`}
          className="sr-only"
          onClick={e => { e.stopPropagation(); triggerMarkWritten() }}
          tabIndex={-1}
          aria-hidden="true"
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — inert is a valid HTML attribute not yet in React's types
          inert=""
        />
        {/* Bulk-select checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item.id)}
          onClick={e => e.stopPropagation()}
          className={`w-4 h-4 rounded accent-violet-500 flex-shrink-0 ${isBulkMode ? 'block' : 'hidden sm:block'}`}
          aria-label={t('practiceList.selectItem')}
        />
        <div className="flex-1 min-w-0 text-sm flex flex-col gap-0.5">
          <div>
            <span className="bg-error-surface text-on-error-surface px-1.5 py-0.5 rounded">
              {item.original}
            </span>
            {' → '}
            <span className="font-medium text-correction">{item.correction}</span>
            {(() => {
              const stars = importanceStars(item.importance_score)
              return stars ? <span className="text-amber-400 text-xs ml-1">{stars}</span> : null
            })()}
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="border border-accent-chip-border text-on-accent-chip bg-accent-chip rounded-full px-2 py-0.5 text-xs">
              {t(`subCat.${item.sub_category}`)}
            </span>
            {isWrittenDown
              ? <span className="text-[10px] text-green-600 border border-green-700 rounded-full px-2 py-0.5">{t('practiceList.writtenDown')}</span>
              : <span className="text-[10px] text-gray-500 border border-gray-700 rounded-full px-2 py-0.5">{t('practiceList.notWrittenDown')}</span>
            }
          </div>
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
  initialFilterNotWritten?: boolean
}

export function PracticeList({ items, onDeleted, initialSubCategory, initialFilterNotWritten }: Props) {
  const { t } = useTranslation()
  const [subCategoryFilter, setSubCategoryFilter] = useState<SubCategory | null>(initialSubCategory ?? null)
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [openItem, setOpenItem] = useState<PracticeItem | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(initialSubCategory !== undefined)
  const [filterNotWritten, setFilterNotWritten] = useState(initialFilterNotWritten ?? false)
  const [sortByImportance, setSortByImportance] = useState(false)
  const [displayItems, setDisplayItems] = useState<PracticeItem[]>(items)
  const [importanceExpanded, setImportanceExpanded] = useState(false)

  useEffect(() => {
    setDisplayItems(items)
  }, [items])

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const url = '/api/practice-items' + (sortByImportance ? '?sort=importance' : '')
    fetch(url)
      .then(r => { if (!r.ok) return; return r.json() })
      .then((data: PracticeItem[] | undefined) => { if (data) setDisplayItems(data) })
      .catch(() => {/* keep existing items on error */})
  }, [sortByImportance])

  const subCategoryCounts = useMemo(() => {
    const counts = Object.fromEntries(SUB_CATEGORIES.map(sc => [sc, 0])) as Record<SubCategory, number>
    for (const item of displayItems) counts[item.sub_category] = (counts[item.sub_category] ?? 0) + 1
    return counts
  }, [displayItems])

  const sortedSubCategories = useMemo(() => {
    return [...SUB_CATEGORIES].sort((a, b) => subCategoryCounts[b] - subCategoryCounts[a])
  }, [subCategoryCounts])

  const colourTiers = useMemo(() => {
    const nonZero = Array.from(new Set(Object.values(subCategoryCounts).filter(c => c > 0))).sort((a, b) => b - a)
    return { rank1: nonZero[0] ?? 0, rank2: nonZero[1] ?? 0 }
  }, [subCategoryCounts])

  function pillClass(sc: SubCategory): string {
    if (sc === subCategoryFilter) return 'border-indigo-500 text-on-accent-chip bg-indigo-500/10'
    const count = subCategoryCounts[sc]
    if (count === 0) return 'border-border-subtle text-text-tertiary'
    if (colourTiers.rank1 > 0 && count === colourTiers.rank1) return 'border-red-800 bg-pill-rank1 text-on-pill-rank1'
    if (colourTiers.rank2 > 0 && count === colourTiers.rank2) return 'border-amber-700 bg-pill-rank2 text-on-pill-rank2'
    return 'border-border text-text-secondary'
  }

  const allPillClass = subCategoryFilter === null && !filterNotWritten
    ? 'border-violet-500 text-pill-violet bg-violet-500/10'
    : 'border-border text-text-secondary'

  useEffect(() => {
    if (!toastMessage) return
    const timeoutId = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(timeoutId)
  }, [toastMessage])

  const filtered = displayItems.filter(item => {
    if (filterNotWritten && item.written_down) return false
    if (subCategoryFilter !== null && item.sub_category !== subCategoryFilter) return false
    return true
  })

  async function deleteItem(id: string): Promise<boolean> {
    const res = await fetch(`/api/practice-items/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setToastMessage(t('practiceList.deleteError'))
      return false
    }
    onDeleted?.([id])
    setDisplayItems(prev => prev.filter(i => i.id !== id))
    return true
  }

  async function markWritten(id: string): Promise<boolean> {
    const res = await fetch(`/api/practice-items/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ written_down: true }),
    })
    if (!res.ok) {
      setToastMessage(t('practiceList.markWrittenError'))
      return false
    }
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
      setToastMessage(t('practiceList.deletePartialError'))
    }
    if (succeeded.length > 0) {
      onDeleted?.(succeeded)
      setDisplayItems(prev => prev.filter(i => !succeeded.includes(i.id)))
    }
    exitBulkMode()
  }

  return (
    <div className="space-y-4">
      {/* Bulk action toolbar — sticky, shown only in bulk mode */}
      {isBulkMode && (
        <div className="sticky top-0 z-30 flex items-center gap-3 px-3 py-2 bg-accent-chip border border-accent-chip-border rounded-xl text-sm">
          {/* Back / exit button */}
          <button
            onClick={exitBulkMode}
            aria-label={t('practiceList.exitSelection')}
            className="text-on-accent-chip hover:text-text-primary p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="w-5 h-5" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <span className="text-on-accent-chip text-sm flex-1">{t('practiceList.selected', { n: selectedIds.size })}</span>

          {/* Select all */}
          <button
            onClick={() => setSelectedIds(new Set(filtered.map(i => i.id)))}
            aria-label={t('practiceList.selectAll')}
            className="text-on-accent-chip hover:text-text-primary p-1"
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
            aria-label={t('practiceList.deleteSelectedAria', { n: selectedIds.size })}
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

      {!isBulkMode && (
        <div className="flex gap-2 flex-wrap text-sm">
          <button
            onClick={() => { setSubCategoryFilter(null); setFilterNotWritten(false) }}
            className={`px-3 py-1 rounded-full border transition-colors ${allPillClass}`}
          >
            {t('practiceList.all')}
          </button>
          {/* Pinned "Not written" filter — always second */}
          <button
            onClick={() => setFilterNotWritten(f => !f)}
            className={`px-3 py-1 rounded-full border transition-colors ${
              filterNotWritten
                ? 'border-amber-500 text-pill-amber bg-amber-500/10'
                : 'border-pill-inactive-border text-pill-inactive'
            }`}
          >
            {t('practiceList.filterNotWritten')}
          </button>
          <button
            onClick={() => setSortByImportance(s => !s)}
            className={`px-3 py-1 rounded-full border transition-colors ${
              sortByImportance
                ? 'border-indigo-500 text-on-accent-chip bg-indigo-500/10'
                : 'border-border text-text-secondary'
            }`}
          >
            ★ {t('practiceList.sortImportance')}
          </button>
          {(isExpanded ? sortedSubCategories : sortedSubCategories.slice(0, 3)).map(sc => (
            <button
              key={sc}
              onClick={() => setSubCategoryFilter(subCategoryFilter === sc ? null : sc)}
              className={`px-3 py-1 rounded-full border transition-colors ${pillClass(sc)}`}
            >
              {t(`subCat.${sc}`)}
              {' '}
              <span className="text-[11px] opacity-80">{subCategoryCounts[sc]}</span>
            </button>
          ))}
          {!isExpanded && sortedSubCategories.length > 3 && (
            <button
              onClick={() => setIsExpanded(true)}
              className="px-3 py-1 rounded-full border border-border text-text-secondary transition-colors"
            >
              {t('practiceList.moreCategories', { n: sortedSubCategories.length - 3 })}
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-text-tertiary text-sm">{t('practiceList.noItems')}</p>
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
            onMarkWritten={markWritten}
            onOpen={setOpenItem}
          />
        ))}
      </ul>

      {openItem && (
        <Modal
          title={t(`type.${openItem.type}`)}
          onClose={() => { setOpenItem(null); setImportanceExpanded(false) }}
        >
          <div className="space-y-3 text-sm">
            <div>
              <>
                <span className="bg-error-surface text-on-error-surface px-1.5 py-0.5 rounded">
                  {openItem.original}
                </span>
                <span className="mx-2 text-text-secondary">→</span>
                <span className="font-medium text-correction">{openItem.correction}</span>
              </>
            </div>
            <p className="text-text-secondary leading-relaxed">{openItem.explanation}</p>
            <span className="border border-accent-chip-border text-on-accent-chip bg-accent-chip rounded-full px-2 py-0.5 text-xs">
              {t(`subCat.${openItem.sub_category}`)}
            </span>
            {importanceStars(openItem.importance_score) && (
              <div className="pt-1">
                <button
                  onClick={() => setImportanceExpanded(e => !e)}
                  className="text-amber-400 text-base leading-none focus:outline-none"
                  aria-label={t('practiceList.importanceToggleAria')}
                >
                  {importanceStars(openItem.importance_score)}
                </button>
                {importanceExpanded && openItem.importance_note && (
                  <p className="mt-1.5 text-text-secondary text-xs leading-relaxed">
                    {openItem.importance_note}
                  </p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {toastMessage && (
        <div
          role="alert"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  )
}
