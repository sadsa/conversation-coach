// components/PracticeItemSheet.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useSwipeable } from 'react-swipeable'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'
import type { PracticeItem } from '@/lib/types'

interface Props {
  item: PracticeItem | null
  /** 1-indexed position of this item in the current view. */
  position: { current: number; total: number } | null
  hasPrev: boolean
  hasNext: boolean
  /** True when the parent view is showing archived (written-down) items. */
  isArchive: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  /** Toggles `written_down` on the item. Returns true on success. */
  onToggleWritten: (item: PracticeItem) => Promise<boolean>
  /** Permanently deletes the item. Returns true on success. */
  onDelete: (item: PracticeItem) => Promise<boolean>
}

const SNIPPET_CONTEXT = 30

function importanceStars(score: number | null): string | null {
  if (score === 3) return '★★★'
  if (score === 2) return '★★☆'
  if (score === 1) return '★☆☆'
  return null
}

function ContextSnippet({ segmentText, startChar, endChar, testId }: {
  segmentText: string
  startChar: number
  endChar: number
  testId: string
}) {
  const snippetStart = Math.max(0, startChar - SNIPPET_CONTEXT)
  const snippetEnd = Math.min(segmentText.length, endChar + SNIPPET_CONTEXT)
  const prefix = segmentText.slice(snippetStart, startChar)
  const error = segmentText.slice(startChar, endChar)
  const suffix = segmentText.slice(endChar, snippetEnd)
  return (
    <p
      data-testid={testId}
      className="text-sm italic text-text-tertiary bg-surface-elevated rounded-lg px-3 py-2 leading-relaxed"
    >
      {snippetStart > 0 && '…'}
      {prefix}
      <span className="not-italic bg-[var(--annotation-unreviewed-bg)] text-[var(--annotation-unreviewed-text)] rounded-sm px-0.5">
        {error}
      </span>
      {suffix}
      {snippetEnd < segmentText.length && '…'}
    </p>
  )
}

/**
 * Docked review panel for practice items. Mirrors AnnotationSheet's layout
 * (bottom on mobile, right on desktop) so the review pattern is consistent
 * across the app. The primary action is mark-as-written / move-back-to-active;
 * delete lives as a quieter secondary action.
 */
export function PracticeItemSheet({
  item,
  position,
  hasPrev,
  hasNext,
  isArchive,
  onClose,
  onPrev,
  onNext,
  onToggleWritten,
  onDelete,
}: Props) {
  const { t } = useTranslation()
  const prefersReducedMotion = useReducedMotion()
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const insidePointerRef = useRef(false)
  const [busyAction, setBusyAction] = useState<'toggle' | 'delete' | null>(null)
  const [importanceExpanded, setImportanceExpanded] = useState(false)

  const isOpen = item !== null

  useEffect(() => {
    if (!isOpen) return
    setImportanceExpanded(false)
    setBusyAction(null)
    previousFocusRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowLeft' && hasPrev) {
        onPrev()
      } else if (e.key === 'ArrowRight' && hasNext) {
        onNext()
      }
    }

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (insidePointerRef.current) {
        insidePointerRef.current = false
        return
      }
      const target = e.target as Element | null
      if (target?.closest('[data-practice-item-id]')) return
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      previousFocusRef.current?.focus()
    }
  }, [isOpen, item?.id, onClose, onPrev, onNext, hasPrev, hasNext])

  function markInsidePointer() {
    insidePointerRef.current = true
  }

  const swipeHandlers = useSwipeable({
    onSwipedDown: (e) => { if (e.absY > 60) onClose() },
    onSwipedLeft: (e) => { if (e.absX > 60 && hasNext) onNext() },
    onSwipedRight: (e) => { if (e.absX > 60 && hasPrev) onPrev() },
    delta: 20,
    trackMouse: false,
  })

  if (!isOpen || !item) return null

  const animationClass = prefersReducedMotion
    ? 'motion-reduce:animate-none'
    : 'motion-safe:animate-[sheet-up_240ms_cubic-bezier(0.16,1,0.3,1)_both] md:motion-safe:animate-[sheet-in-right_240ms_cubic-bezier(0.16,1,0.3,1)_both]'

  async function handleToggle() {
    if (!item || busyAction) return
    setBusyAction('toggle')
    await onToggleWritten(item)
    setBusyAction(null)
  }

  async function handleDelete() {
    if (!item || busyAction) return
    setBusyAction('delete')
    await onDelete(item)
    setBusyAction(null)
  }

  const stars = importanceStars(item.importance_score)

  return (
    <aside
      role="complementary"
      aria-label={t('practiceSheet.aria')}
      onMouseDownCapture={markInsidePointer}
      onTouchStartCapture={markInsidePointer}
      className={`
        fixed left-0 right-0 bottom-0 z-40
        md:left-auto md:top-11 md:right-0 md:bottom-0 md:w-[400px]
        bg-surface-elevated border-t border-border md:border-t-0 md:border-l
        shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.18)] md:shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.12)]
        rounded-t-2xl md:rounded-none
        flex flex-col max-h-[75vh] md:max-h-none
        ${animationClass}
      `}
      {...swipeHandlers}
    >
      {/* Mobile drag handle */}
      <div className="flex justify-center pt-2 pb-1 md:hidden" aria-hidden="true">
        <span className="w-10 h-1 rounded-full bg-border" />
      </div>

      {/* Header: position, prev/next, close */}
      <header className="flex items-center gap-2 px-4 pt-1 pb-3 md:pt-5 md:pb-4 md:px-5 border-b border-border">
        <h2 className="font-semibold text-text-primary">
          {isArchive ? t('practiceSheet.titleArchive') : t('practiceSheet.titleActive')}
        </h2>
        {position && (
          <span className="text-xs text-text-tertiary tabular-nums ml-1">
            {t('sheet.position', { n: position.current, total: position.total })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            aria-label={t('sheet.prev')}
            className="w-9 h-9 rounded-md flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Icon name="chevron-left" className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label={t('sheet.next')}
            className="w-9 h-9 rounded-md flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <Icon name="chevron-right" className="w-5 h-5" />
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('sheet.close')}
            className="w-9 h-9 ml-1 rounded-md flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg transition-colors"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Body: keyed on item.id so React swaps the subtree cleanly on prev/next */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div
          key={item.id}
          className="space-y-5 motion-safe:animate-[fadein_180ms_ease-out_both]"
        >
          {/* Original → Correction. Original is muted/struck-through so the
              correction wins the visual hierarchy. */}
          <p className="text-base md:text-lg leading-relaxed">
            <span className="text-text-tertiary line-through decoration-text-tertiary/40 mr-2">
              {item.original}
            </span>
            <span className="font-semibold text-lg md:text-xl text-correction">
              {item.correction}
            </span>
          </p>

          <p className="text-text-secondary leading-relaxed text-base">
            {item.explanation}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-accent-chip-border text-on-accent-chip bg-accent-chip rounded-full px-3 py-1 text-sm">
              {t(`subCat.${item.sub_category}`)}
            </span>
            {stars && (
              item.importance_note ? (
                <button
                  onClick={() => setImportanceExpanded(e => !e)}
                  className="text-pill-amber text-base leading-none rounded px-1"
                  aria-label={t('practiceList.importanceToggleAria')}
                  aria-expanded={importanceExpanded}
                >
                  {stars}
                </button>
              ) : (
                <span className="text-pill-amber text-base leading-none">{stars}</span>
              )
            )}
          </div>

          {importanceExpanded && item.importance_note && (
            <p className="text-text-secondary text-sm leading-relaxed -mt-3">
              {item.importance_note}
            </p>
          )}

          {item.segment_text !== null && item.start_char !== null && item.end_char !== null && (
            <ContextSnippet
              segmentText={item.segment_text}
              startChar={item.start_char}
              endChar={item.end_char}
              testId={`context-snippet-sheet-${item.id}`}
            />
          )}
        </div>
      </div>

      {/* Footer: primary action + secondary delete */}
      <footer className="flex items-center gap-2 px-4 py-3 md:px-5 border-t border-border bg-surface-elevated">
        <button
          type="button"
          onClick={handleToggle}
          disabled={busyAction !== null}
          data-testid="sheet-toggle-written"
          className={`
            flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-medium
            text-sm transition-colors disabled:opacity-50
            ${isArchive
              ? 'border-border bg-surface text-text-secondary hover:text-text-primary hover:border-text-secondary'
              : 'border-widget-write-border bg-widget-write-bg text-widget-write-text hover:bg-widget-write-bg-hover'
            }
          `}
        >
          <Icon name={isArchive ? 'rotate-ccw' : 'check'} className="w-5 h-5" />
          {isArchive ? t('practiceSheet.moveToActive') : t('practiceSheet.markWritten')}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busyAction !== null}
          aria-label={t('practiceSheet.deleteAria')}
          data-testid="sheet-delete"
          className="w-11 h-11 rounded-xl border border-border bg-surface text-text-tertiary hover:text-status-error hover:border-status-error/50 transition-colors flex items-center justify-center disabled:opacity-50"
        >
          <Icon name="trash" className="w-5 h-5" />
        </button>
      </footer>
    </aside>
  )
}
