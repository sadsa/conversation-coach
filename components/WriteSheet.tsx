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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'
import Link from 'next/link'
import { DockedSheet } from '@/components/DockedSheet'
import { IconButton } from '@/components/IconButton'
import { NavHint } from '@/components/NavHint'
import { HushStack } from '@/components/HushStack'
import { ImportancePill } from '@/components/ImportancePill'
import { buttonStyles } from '@/components/Button'
import type { PracticeItem } from '@/lib/types'

interface Props {
  item: PracticeItem | null
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
  /** When provided, renders "Practise this phrase" as the primary footer button.
   *  Omit on the Written (archive) view where practise is not the primary job. */
  onPractise?: (item: PracticeItem) => void
}

interface OverflowMenuProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onToggleWritten: () => void
  onDelete: () => void
  busy: boolean
  isWritten: boolean
  primaryLabelKey: string
  primaryBusyKey: string
  initialFocus?: boolean
  testId?: string
}

/**
 * Tiny popover anchored to the overflow trigger. Carries the toggle-written
 * action and the destructive Delete (kept undoable for 5 seconds via the
 * parent's toast).
 */
function OverflowMenu({
  isOpen, onOpenChange, onToggleWritten, onDelete,
  busy, isWritten, primaryLabelKey, primaryBusyKey, initialFocus, testId,
}: OverflowMenuProps) {
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
        {...(testId ? { 'data-testid': testId } : {})}
        {...(initialFocus ? { 'data-initial-focus': true } : {})}
      />
      {isOpen && (
        <div
          role="menu"
          aria-label={t('writeSheet.moreActionsAria')}
          className="
            absolute top-full right-0 mt-2 z-10
            min-w-[200px] py-1
            bg-surface-elevated border border-border rounded-lg
            shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]
            motion-safe:animate-[fadein_140ms_ease-out_both]
          "
        >
          {/* Mark as written / Move back */}
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            {...(testId ? { 'data-testid': 'sheet-toggle-written' } : {})}
            onClick={() => { onOpenChange(false); onToggleWritten() }}
            disabled={busy}
            className="
              w-full flex items-center gap-3 px-3 py-2 text-left
              text-text-primary hover:bg-surface disabled:opacity-50
              transition-colors rounded-md text-sm font-medium
            "
          >
            <Icon name={isWritten ? 'rotate-ccw' : 'check'} className="w-4 h-4 shrink-0 text-text-tertiary" />
            {busy ? t(primaryBusyKey) : t(primaryLabelKey)}
          </button>

          <div className="my-1 border-t border-border-subtle" />

          {/* Delete — The "you can undo for 5 seconds" reassurance lives only
              in the aria-label; the visible helper text was distilled out. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => { onOpenChange(false); onDelete() }}
            disabled={busy}
            {...(testId ? { 'data-testid': 'sheet-delete' } : {})}
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
  hasPrev,
  hasNext,
  isWritten,
  onClose,
  onPrev,
  onNext,
  onToggleWritten,
  onDelete,
  onPractise,
}: Props) {
  const { t } = useTranslation()
  const [busyAction, setBusyAction] = useState<'toggle' | 'delete' | null>(null)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastFailedAction, setLastFailedAction] = useState<'toggle' | 'delete' | null>(null)
  const [importanceExpanded, setImportanceExpanded] = useState(false)

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
    setImportanceExpanded(false)
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

  // Label keys consumed by <OverflowMenu> for its toggle-written row.
  // The standalone primary "Mark as written" button was retired when
  // Practise became the primary action — toggle + delete now live in the
  // overflow menu.
  const primaryLabelKey = isWritten ? 'writeSheet.moveBack' : 'writeSheet.markWritten'
  const primaryBusyKey = isWritten ? 'writeSheet.moveBackBusy' : 'writeSheet.markWrittenBusy'

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
      headerLead={null}
    >
      <NavHint />
      <div className="space-y-6">
        {item.session_title && (
          <Link
            data-testid="sheet-source-link"
            href={`/sessions/${item.session_id}`}
            className="block text-xs text-text-tertiary underline underline-offset-2 hover:text-text-secondary transition-colors"
          >
            {item.session_title}
          </Link>
        )}

        {/* Hush stack — replaces the older CorrectionInContext block. Trades
            surrounding-sentence context for a calmer, sentence-first layout;
            the session source link above is the user's path back to the
            full context on /sessions/[id]. Eyebrow flips to "Sounds off"
            for naturalness items (no rewrite) so it matches what the body
            actually shows. On mobile, the eyebrow row hosts the ··· overflow
            menu and × close button (the header is hidden on mobile), matching
            the AnnotationCard pattern. */}
        <HushStack
          eyebrow={item.correction === null
            ? t('sheet.eyebrowSoundsOff')
            : t('sheet.eyebrowYouSaid')}
          original={item.original}
          correction={item.correction}
          eyebrowAction={
            <div className="flex items-center gap-0.5 md:hidden -my-1">
              <OverflowMenu
                isOpen={overflowOpen}
                onOpenChange={setOverflowOpen}
                onToggleWritten={handleToggle}
                onDelete={handleDelete}
                busy={busyAction !== null}
                isWritten={isWritten}
                primaryLabelKey={primaryLabelKey}
                primaryBusyKey={primaryBusyKey}
              />
              <IconButton
                icon="close"
                size="lg"
                onClick={onClose}
                aria-label={t('sheet.close')}
              />
            </div>
          }
        />

        <p className="text-text-secondary leading-relaxed text-base">
          {item.explanation}
        </p>

        <ImportancePill
          score={item.importance_score}
          note={item.importance_note ?? null}
          expanded={importanceExpanded}
          onToggle={() => setImportanceExpanded(v => !v)}
          toggleAriaKey="writeList.importanceToggleAria"
        />

        {importanceExpanded && item.importance_note && (
          <p className="text-text-secondary text-sm leading-relaxed">
            {item.importance_note}
          </p>
        )}

        <div className="pt-7 space-y-3">
          {onPractise && (
            <button
              type="button"
              data-testid="sheet-practise-btn"
              data-initial-focus
              onClick={() => onPractise(item)}
              disabled={busyAction !== null}
              className={buttonStyles({ variant: 'primary', size: 'md', fullWidth: true })}
            >
              <Icon name="play-circle" className="w-4 h-4 mr-2" />
              {t('writeSheet.practise')}
            </button>
          )}

          {/* Desktop-only overflow menu — on mobile it lives in the eyebrow
              row alongside the close button (AnnotationCard pattern). */}
          <div className="hidden md:flex justify-end">
            <OverflowMenu
              isOpen={overflowOpen}
              onOpenChange={setOverflowOpen}
              onToggleWritten={handleToggle}
              onDelete={handleDelete}
              busy={busyAction !== null}
              isWritten={isWritten}
              primaryLabelKey={primaryLabelKey}
              primaryBusyKey={primaryBusyKey}
              initialFocus={!onPractise}
              testId="sheet-overflow"
            />
          </div>
        </div>
      </div>

      <div role="status" aria-live="polite" className="mt-4 min-h-[1rem]">
        {errorMessage && (
          <div className="rounded-lg border border-status-error/30 bg-error-container px-3 py-2 space-y-1.5">
            {/* `aria-describedby` links the retry button to the error message,
                so screen readers announce the cause when the focused control
                is the retry. Same pattern as AnnotationCard. */}
            <p id={`ws-err-${item.id}`} className="text-status-error text-sm leading-snug">{errorMessage}</p>
            {typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine && (
              <p className="text-text-tertiary text-xs leading-snug">{t('annotation.offlineNote')}</p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRetry}
                disabled={busyAction !== null}
                aria-describedby={`ws-err-${item.id}`}
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
