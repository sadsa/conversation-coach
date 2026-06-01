// components/AnnotationCard.tsx
//
// One annotation rendered in the docked AnnotationSheet. After the design
// rework the card carries a deliberate hierarchy:
//
//   1. A primary "Save to my Study list" button (shared `<Button>`) — the
//      one action the user is here for. Verb-first, full-width on mobile,
//      gets initial focus when the sheet opens (`data-initial-focus`), and
//      flips to an "Added to my Study list" confirmation after a save. The
//      saved-state label carries the destination itself so we don't need a
//      separate hint paragraph below — the button IS the receipt.
//   2. A quiet text "Not useful — hide it" affordance underneath. Same
//      idempotent toggle the old 👎 carried, but visually demoted so it can
//      never compete with Save for attention.
//
// The hidden-state caption ("Hidden from your transcript.") stays — without
// it the only signal is the opacity fade on the whole card, which on its own
// reads as "loading" more than "dismissed".
//
// Type and sub-category indicators (the coloured grammar/naturalness dot in
// the sheet header and the sub-category pill that used to sit above the
// importance pill) were both removed. The user reads through the same sheet
// for both kinds of correction and never acted on either signal.
//
// Errors no longer auto-dismiss. They surface a Retry button that re-runs
// the failed action, and (when applicable) an offline note so the user
// understands why retrying is unlikely to help right now.
//
// The "Not useful — hide it" affordance lives in the ··· overflow menu on
// EVERY viewport. The desktop sheet header already carries close + prev/next,
// so the menu is the single home for the dismiss action regardless of width —
// one place to learn, not a menu-item on mobile and a ghost button on desktop.

'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Annotation } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'
import { buttonStyles } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/IconButton'
import { HushStack } from '@/components/HushStack'

interface OverflowMenuProps {
  isUnhelpful: boolean
  busy: boolean
  onToggle: () => void
}

function AnnotationOverflowMenu({ isUnhelpful, busy, onToggle }: OverflowMenuProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setMenuStyle({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      })
    }
    setIsOpen(true)
  }

  useEffect(() => {
    if (!isOpen) return
    function handlePointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (menuRef.current && target && !menuRef.current.contains(target) &&
          triggerRef.current && !triggerRef.current.contains(target)) {
        setIsOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); setIsOpen(false) }
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  return (
    <div className="shrink-0">
      <IconButton
        ref={triggerRef}
        icon="more"
        aria-label={t('annotation.moreActionsAria')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => isOpen ? setIsOpen(false) : openMenu()}
        disabled={busy}
        size="lg"
      />
      {isOpen && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('annotation.moreActionsAria')}
          style={menuStyle}
          className="
            fixed z-[200]
            min-w-[180px] py-1
            bg-surface-elevated border border-border rounded-lg
            shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]
            motion-safe:animate-[fadein_140ms_ease-out_both]
          "
        >
          <button
            type="button"
            role="menuitem"
            aria-label={isUnhelpful ? t('annotation.notUsefulRestoreAria') : t('annotation.notUsefulAria')}
            onClick={() => { setIsOpen(false); onToggle() }}
            disabled={busy}
            className="
              w-full flex items-center gap-3 px-3 py-2 text-left
              text-text-primary hover:bg-surface disabled:opacity-50
              transition-colors rounded-md text-sm font-medium normal-case tracking-normal
            "
          >
            {isUnhelpful ? t('annotation.notUsefulRestore') : t('annotation.notUseful')}
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

interface Props {
  annotation: Annotation
  sessionId: string
  practiceItemId: string | null
  /** Retained on the interface so transcript-side state plumbing (the green
   *  written-down highlight in AnnotatedText) is unaffected. The card no
   *  longer surfaces a UI for it — written-down lives on /write now. */
  isWrittenDown: boolean
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
  /** Kept for prop-shape compatibility with TranscriptView; unused here. */
  onAnnotationWritten: (annotationId: string) => void
  onAnnotationUnwritten: (annotationId: string) => void
  onAnnotationUnhelpfulChanged?: (annotationId: string, isUnhelpful: boolean) => void
  /** Called after a successful save — used on mobile to dismiss the sheet. */
  onClose?: () => void
}

export function AnnotationCard({
  annotation, sessionId,
  practiceItemId: initialPracticeItemId,
  isWrittenDown: _isWrittenDown,
  onAnnotationAdded, onAnnotationRemoved,
  onAnnotationWritten: _onWritten, onAnnotationUnwritten: _onUnwritten,
  onAnnotationUnhelpfulChanged,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const [practiceItemId, setPracticeItemId] = useState<string | null>(initialPracticeItemId)
  const [isUnhelpful, setIsUnhelpful] = useState<boolean>(annotation.is_unhelpful)
  const [busy, setBusy] = useState<'helpful' | 'unhelpful' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** Which action failed last — drives the Retry button so it knows which
   *  handler to re-run without the user having to find the original control. */
  const [lastFailedAction, setLastFailedAction] = useState<'helpful' | 'unhelpful' | null>(null)
  /** Becomes true for ~600ms after a successful save so the primary button
   *  can play the saved-pulse keyframe — a small reflexive "yes, that
   *  happened" without needing a toast. */
  const [justSaved, setJustSaved] = useState(false)
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setPracticeItemId(initialPracticeItemId)
    setIsUnhelpful(annotation.is_unhelpful)
    setErrorMessage(null)
    setLastFailedAction(null)
    setJustSaved(false)
    if (justSavedTimer.current) {
      clearTimeout(justSavedTimer.current)
      justSavedTimer.current = null
    }
  }, [annotation.id, annotation.is_unhelpful, initialPracticeItemId])

  useEffect(() => {
    return () => {
      if (justSavedTimer.current) clearTimeout(justSavedTimer.current)
    }
  }, [])

  function triggerSavedPulse() {
    setJustSaved(true)
    if (justSavedTimer.current) clearTimeout(justSavedTimer.current)
    justSavedTimer.current = setTimeout(() => setJustSaved(false), 650)
  }

  // Both handlers are idempotent toggles. They also enforce mutual exclusion:
  // saving clears unhelpful (and vice versa) so the card can never claim
  // "Saved" and "Hidden" at the same time.

  async function setUnhelpful(value: boolean): Promise<boolean> {
    setIsUnhelpful(value)
    onAnnotationUnhelpfulChanged?.(annotation.id, value)
    const res = await fetch(`/api/annotations/${annotation.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_unhelpful: value }),
    })
    if (!res.ok) {
      setIsUnhelpful(!value)
      onAnnotationUnhelpfulChanged?.(annotation.id, !value)
      return false
    }
    return true
  }

  async function savePracticeItem(): Promise<boolean> {
    const res = await fetch('/api/practice-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        annotation_id: annotation.id,
        type: annotation.type,
        original: annotation.original,
        correction: annotation.correction,
        explanation: annotation.explanation,
        sub_category: annotation.sub_category,
        flashcard_front: annotation.flashcard_front ?? null,
        flashcard_back: annotation.flashcard_back ?? null,
        flashcard_note: annotation.flashcard_note ?? null,
        importance_score: annotation.importance_score ?? null,
        importance_note: annotation.importance_note ?? null,
      }),
    })
    if (!res.ok) return false
    const { id } = await res.json() as { id: string }
    setPracticeItemId(id)
    onAnnotationAdded(annotation.id, id)
    triggerSavedPulse()
    return true
  }

  async function deletePracticeItem(id: string): Promise<boolean> {
    const res = await fetch(`/api/practice-items/${id}`, { method: 'DELETE' })
    if (!res.ok) return false
    setPracticeItemId(null)
    onAnnotationRemoved(annotation.id)
    return true
  }

  function recordFailure(action: 'helpful' | 'unhelpful', message: string) {
    setErrorMessage(message)
    setLastFailedAction(action)
  }

  function clearError() {
    setErrorMessage(null)
    setLastFailedAction(null)
  }

  async function handleHelpful() {
    if (busy) return
    clearError()
    setBusy('helpful')
    try {
      if (practiceItemId) {
        const ok = await deletePracticeItem(practiceItemId)
        if (!ok) recordFailure('helpful', t('annotation.saveError'))
      } else {
        // Save. Clear unhelpful first so the two signals stay mutually
        // exclusive (a save is a vote of confidence; the dismissal is gone).
        if (isUnhelpful) {
          const ok = await setUnhelpful(false)
          if (!ok) {
            recordFailure('helpful', t('annotation.unhelpfulError'))
            return
          }
        }
        const saved = await savePracticeItem()
        if (!saved) recordFailure('helpful', t('annotation.saveError'))
        else onClose?.()
      }
    } finally {
      setBusy(null)
    }
  }

  async function handleUnhelpful() {
    if (busy) return
    clearError()
    setBusy('unhelpful')
    try {
      if (isUnhelpful) {
        const ok = await setUnhelpful(false)
        if (!ok) recordFailure('unhelpful', t('annotation.unhelpfulError'))
      } else {
        // Marking unhelpful — drop any saved practice item first so the user
        // doesn't end up reviewing a card they just dismissed.
        if (practiceItemId) {
          const ok = await deletePracticeItem(practiceItemId)
          if (!ok) {
            recordFailure('unhelpful', t('annotation.saveError'))
            return
          }
        }
        const ok = await setUnhelpful(true)
        if (!ok) recordFailure('unhelpful', t('annotation.unhelpfulError'))
      }
    } finally {
      setBusy(null)
    }
  }

  function handleRetry() {
    if (lastFailedAction === 'helpful') void handleHelpful()
    else if (lastFailedAction === 'unhelpful') void handleUnhelpful()
  }

  // In-flight only when adding (no practice item yet). Removing keeps the
  // "Added" label so the button doesn't flicker back to the save CTA mid-undo.
  const isSaving = !practiceItemId && busy === 'helpful'
  const primaryLabel = practiceItemId
    ? t('annotation.savedPrimary')
    : isSaving
      ? t('annotation.savingPrimary')
      : t('annotation.savePrimary')
  const primaryAria = practiceItemId ? t('annotation.savedPrimaryAria') : t('annotation.savePrimaryAria')

  // Best-effort offline detection. We only consult `navigator` when an error
  // is on screen — it's a hint, not load-bearing logic, so SSR gets the safe
  // default of "we don't know" (treated as online).
  const isOffline =
    errorMessage !== null &&
    typeof navigator !== 'undefined' &&
    'onLine' in navigator &&
    !navigator.onLine

  return (
    <div
      className={`space-y-6 transition-opacity duration-200 ${isUnhelpful ? 'opacity-60' : 'opacity-100'}`}
      data-unhelpful={isUnhelpful || undefined}
    >
      {/* Hush stack — sentence-first body. Eyebrow flips to "Sounds off" for
          naturalness annotations (no rewrite); the body in that case shows the
          flagged fragment with the quiet steel-blue `naturalness-underline`
          token rather than a strike-through, so "You said" would promise a
          rewrite the user won't find. Grammar annotations keep "You said".
          On mobile, the eyebrow row hosts the ··· overflow menu and × close
          button (the header is hidden on mobile). */}
      <HushStack
        eyebrow={annotation.correction === null
          ? t('sheet.eyebrowSoundsOff')
          : t('sheet.eyebrowYouSaid')}
        original={annotation.original}
        correction={annotation.correction}
        eyebrowAction={
          // The ··· dismiss menu rides the eyebrow row on every viewport so
          // "Not useful" has one home. The × close stays mobile-only — the
          // desktop sheet header owns close + prev/next.
          <div className="flex items-center gap-0.5 -my-1">
            <AnnotationOverflowMenu
              isUnhelpful={isUnhelpful}
              busy={busy !== null}
              onToggle={handleUnhelpful}
            />
            {onClose && (
              <IconButton
                icon="close"
                size="lg"
                onClick={onClose}
                aria-label={t('sheet.close')}
                className="md:hidden"
              />
            )}
          </div>
        }
      />

      <p className="text-text-secondary leading-relaxed text-base">
        {annotation.explanation}
      </p>


      {/* Action region — primary verb above, quiet secondary below. The
          `border-t` divider that used to live here was retired — the Hush
          direction relies on whitespace + the primary button's visual mass
          for separation, and a single divider inside an otherwise-borderless
          body read as half-committed. The hidden-state caption stays — without
          it the only feedback is the card-wide opacity fade, which reads as
          "loading" by itself.

          The primary carries `data-initial-focus` so DockedSheet's open
          lifecycle puts the cursor on the action the user is here for. The
          "Not useful" secondary is a quiet ghost button (1px border, pill
          shape, 500-weight) instead of an underlined text-link — readable
          as interactive without competing with the filled primary above. */}
      <div className="pt-7 space-y-3">
        {isUnhelpful && (
          <p className="text-sm text-text-tertiary leading-snug">
            {t('annotation.unhelpfulHint')}
          </p>
        )}

        <button
          type="button"
          data-initial-focus
          onClick={handleHelpful}
          disabled={busy !== null}
          aria-label={primaryAria}
          aria-pressed={!!practiceItemId}
          className={buttonStyles({
            variant: practiceItemId ? 'saved' : 'primary',
            size: 'md',
            fullWidth: true,
            className: justSaved ? 'motion-safe:animate-[saved-pulse_650ms_ease-out_both]' : '',
          })}
        >
          {isSaving && (
            <span
              aria-hidden="true"
              className="w-4 h-4 mr-2 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
            />
          )}
          {practiceItemId && (
            <Icon name="check" className="w-4 h-4 mr-2" />
          )}
          {primaryLabel}
        </button>
      </div>

      <div role="status" aria-live="polite" className="min-h-[1rem]">
        {errorMessage && (
          <div className="rounded-lg border border-status-error/30 bg-error-container px-3 py-2 space-y-1.5">
            {/* `aria-describedby` ties the retry button to the error message
                above it — screen readers announce "Retry. <error message>"
                rather than a context-free "Retry. Button." */}
            <p id={`ann-err-${annotation.id}`} className="text-status-error text-sm leading-snug">{errorMessage}</p>
            {isOffline && (
              <p className="text-text-tertiary text-xs leading-snug">{t('annotation.offlineNote')}</p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRetry}
                disabled={busy !== null}
                aria-describedby={`ann-err-${annotation.id}`}
                className="text-status-error text-sm font-medium hover:underline disabled:opacity-50 px-1 py-0.5 rounded"
              >
                {t('annotation.retry')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
