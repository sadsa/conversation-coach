// components/WriteSheet.tsx
//
// Docked review panel for items in the Write surface. After the design
// alignment pass this sheet is the structural twin of `AnnotationSheet`:
//
//   • Header: position pill + prev/next/close buttons.
//   • Body: shared `<NavHint>` chip on first open, then session source link,
//     correction-in-context, explanation, and importance pill (expandable
//     note when present).
//   • Footer: full-width primary `<button>` styled via `buttonStyles()` for
//     pixel-parity with AnnotationCard, plus a quiet "more actions" overflow
//     menu carrying the destructive Delete (kept undoable for 5 seconds via
//     the parent's toast).
//
// Auto-advance: a successful Mark / Move-back drives the parent to open the
// next sibling in the current list (Gmail's archive-and-next pattern). Once
// the user reaches the last item the sheet closes naturally. The parent owns
// that flow; the sheet just calls `onToggleWritten` and trusts the resulting
// `item` prop change.

'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'
import { DockedSheet } from '@/components/DockedSheet'
import { IconButton } from '@/components/IconButton'
import { NavHint } from '@/components/NavHint'
import { ImportancePill } from '@/components/ImportancePill'
import { StrikeOriginal } from '@/components/StrikeOriginal'
import { CorrectionInContext } from '@/components/CorrectionInContext'
import { buttonStyles } from '@/components/Button'
import type { PracticeItem } from '@/lib/types'

interface Props {
  item: PracticeItem | null
  /** 1-indexed position of this item in the current view. */
  position: { current: number; total: number } | null
  hasPrev: boolean
  hasNext: boolean
  /** True when the parent view is showing the Written (archive) tab. */
  isWritten: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  /** Toggles `written_down` on the item. Returns true on success. */
  onToggleWritten: (item: PracticeItem) => Promise<boolean>
  /** Permanently deletes the item (undoable via the parent's toast). */
  onDelete: (item: PracticeItem) => Promise<boolean>
}

interface OverflowMenuProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
  busy: boolean
}

/**
 * Tiny popover anchored to the overflow trigger. Single item today
 * (Delete) but the structure is ready for additional row actions
 * without crowding the footer.
 */
function OverflowMenu({ isOpen, onOpenChange, onDelete, busy }: OverflowMenuProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    firstItemRef.current?.focus()

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onOpenChange(false)
      }
    }
    function handlePointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        onOpenChange(false)
      }
    }

    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
    }
  }, [isOpen, onOpenChange])

  return (
    <div ref={containerRef} className="relative shrink-0">
      <IconButton
        icon="more"
        aria-label={t('writeSheet.moreActionsAria')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => onOpenChange(!isOpen)}
        disabled={busy}
        size="lg"
        data-testid="sheet-overflow"
      />
      {isOpen && (
        <div
          role="menu"
          aria-label={t('writeSheet.moreActionsAria')}
          // Anchored above the trigger so it doesn't collide with the
          // bottom-anchored sheet edge on mobile. `motion-safe:` for
          // reduced-motion respect.
          className="
            absolute bottom-full right-0 mb-2 z-10
            min-w-[200px] py-1
            bg-surface-elevated border border-border rounded-lg
            shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]
            motion-safe:animate-[fadein_140ms_ease-out_both]
          "
        >
          {/* Single-line item. The "you can undo for 5 seconds" reassurance
              used to live as a visible secondary line, but the user sees the
              undo toast immediately after tapping — visible helper text was
              just describing the next state. We keep the reassurance in the
              aria-label so screen readers still get it. */}
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenChange(false)
              onDelete()
            }}
            disabled={busy}
            data-testid="sheet-delete"
            aria-label={t('writeSheet.deleteAria')}
            className="
              w-full flex items-center gap-3 px-3 py-2 text-left
              text-status-error hover:bg-error-bg/40 disabled:opacity-50
              transition-colors rounded-md text-sm font-medium
            "
          >
            <Icon name="trash" className="w-4 h-4 shrink-0" />
            {t('writeSheet.deleteLabel')}
          </button>
        </div>
      )}
    </div>
  )
}


export function WriteSheet({
  item,
  position,
  hasPrev,
  hasNext,
  isWritten,
  onClose,
  onPrev,
  onNext,
  onToggleWritten,
  onDelete,
}: Props) {
  const { t } = useTranslation()
  const [busyAction, setBusyAction] = useState<'toggle' | 'delete' | null>(null)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastFailedAction, setLastFailedAction] = useState<'toggle' | 'delete' | null>(null)
  const [noteExpanded, setNoteExpanded] = useState(false)

  const isOpen = item !== null

  // Reset transient per-item state whenever the user navigates to a new item
  // or reopens the sheet. The overflow menu in particular must NEVER survive
  // an item swap — it would dangle over an unrelated card.
  useEffect(() => {
    if (!isOpen) return
    setBusyAction(null)
    setOverflowOpen(false)
    setErrorMessage(null)
    setLastFailedAction(null)
    setNoteExpanded(false)
  }, [isOpen, item?.id])

  if (!isOpen || !item) return null

  async function handleToggle() {
    if (!item || busyAction) return
    setErrorMessage(null)
    setLastFailedAction(null)
    setBusyAction('toggle')
    const ok = await onToggleWritten(item)
    // Parent re-renders us with either the next item (auto-advance) or
    // null (sheet closes). Either way our local `item.id` change resets
    // busyAction via the effect above.
    if (!ok) {
      setErrorMessage(t('writeList.markWrittenError'))
      setLastFailedAction('toggle')
    }
    setBusyAction(null)
  }

  async function handleDelete() {
    if (!item || busyAction) return
    setErrorMessage(null)
    setLastFailedAction(null)
    setBusyAction('delete')
    const ok = await onDelete(item)
    if (!ok) {
      setErrorMessage(t('writeList.deleteError'))
      setLastFailedAction('delete')
    }
    setBusyAction(null)
  }

  function handleRetry() {
    if (lastFailedAction === 'toggle') void handleToggle()
    else if (lastFailedAction === 'delete') void handleDelete()
  }

  const primaryLabelKey = isWritten ? 'writeSheet.moveBack' : 'writeSheet.markWritten'
  const primaryBusyKey = isWritten ? 'writeSheet.moveBackBusy' : 'writeSheet.markWrittenBusy'
  const primaryAriaKey = isWritten ? 'writeSheet.moveBackAria' : 'writeSheet.markWrittenAria'
  const isToggling = busyAction === 'toggle'
  const primaryLabel = isToggling ? t(primaryBusyKey) : t(primaryLabelKey)
  // The button uses our shared Button primitive for pixel parity with
  // AnnotationCard. In the Written view we want the action to feel
  // reversible (neutral border) rather than green/active — secondary
  // variant covers that without an extra style override.
  //
  // For the "Mark as written" path we tint green via the widget-write tokens
  // (same colour the Write tab pill uses) so the destination state is
  // visually anticipated. Arbitrary CSS-variable values are used here on
  // purpose — they outrank the secondary variant's `bg-surface`/etc.
  // utilities in JIT order, mirroring the same trick AnnotationCard uses
  // for its saved state.
  const primaryClassName = buttonStyles({
    variant: 'secondary',
    size: 'md',
    fullWidth: true,
    className: isWritten
      ? ''
      : `
          border-[color:var(--color-widget-write-border)]
          bg-[color:var(--color-widget-write-bg)]
          text-[color:var(--color-widget-write-text)]
          hover:bg-[color:var(--color-widget-write-bg-hover)]
          hover:text-[color:var(--color-widget-write-text)]
        `,
  })

  return (
    <DockedSheet
      isOpen={isOpen}
      ariaLabel={t('writeSheet.aria')}
      onClose={onClose}
      onPrev={onPrev}
      onNext={onNext}
      hasPrev={hasPrev}
      hasNext={hasNext}
      preserveOutsideSelector="[data-write-item-id]"
      mobileMaxHeight="75vh"
      contentKey={item.id}
      headerLead={
        position && (
          <span
            key={position.current}
            className="text-xs text-text-tertiary tabular-nums motion-safe:animate-[fadein_180ms_ease-out_both]"
          >
            {t('sheet.position', { n: position.current, total: position.total })}
          </span>
        )
      }
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-initial-focus
            data-testid="sheet-toggle-written"
            onClick={handleToggle}
            disabled={busyAction !== null}
            aria-label={t(primaryAriaKey)}
            aria-pressed={isWritten}
            className={primaryClassName}
          >
            <Icon
              name={isWritten ? 'rotate-ccw' : 'check'}
              className="w-4 h-4 mr-2"
            />
            {primaryLabel}
          </button>
          <OverflowMenu
            isOpen={overflowOpen}
            onOpenChange={setOverflowOpen}
            onDelete={handleDelete}
            busy={busyAction !== null}
          />
        </div>
      }
    >
      <NavHint />
      <div className="space-y-6">
        {/* Session title + correction grouped tightly: WHERE → WHAT */}
        <div className="space-y-2">
          {item.session_title && item.session_title.trim() !== '' && (
            <Link
              href={`/sessions/${item.session_id}`}
              data-testid="sheet-source-link"
              className="block text-xs text-text-tertiary hover:text-text-secondary transition-colors truncate"
            >
              {item.session_title}
            </Link>
          )}
          {item.segment_text !== null && item.start_char !== null && item.end_char !== null ? (
            <CorrectionInContext
              segmentText={item.segment_text}
              startChar={item.start_char}
              endChar={item.end_char}
              original={item.original}
              correction={item.correction}
              size="sheet"
              testId={`correction-in-context-sheet-${item.id}`}
            />
          ) : (
            <StrikeOriginal
              original={item.original}
              correction={item.correction}
              size="sheet"
            />
          )}
        </div>

        <p className="text-text-secondary leading-relaxed text-base">
          {item.explanation}
        </p>

        <div className="space-y-2">
          <ImportancePill
            score={item.importance_score}
            note={item.importance_note}
            expanded={noteExpanded}
            onToggle={() => setNoteExpanded(v => !v)}
            toggleAriaKey="writeList.importanceToggleAria"
          />
          {noteExpanded && item.importance_note && (
            <p className="text-text-secondary text-sm leading-relaxed pl-1">
              {item.importance_note}
            </p>
          )}
        </div>
      </div>

      <div role="status" aria-live="polite" className="mt-4 min-h-[1rem]">
        {errorMessage && (
          <div className="rounded-lg border border-status-error/30 bg-error-container px-3 py-2 space-y-1.5">
            <p className="text-status-error text-sm leading-snug">{errorMessage}</p>
            {typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine && (
              <p className="text-text-tertiary text-xs leading-snug">{t('annotation.offlineNote')}</p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRetry}
                disabled={busyAction !== null}
                className="text-status-error text-sm font-medium hover:underline disabled:opacity-50 px-1 py-0.5 rounded"
              >
                {t('annotation.retry')}
              </button>
            </div>
          </div>
        )}
      </div>
    </DockedSheet>
  )
}
