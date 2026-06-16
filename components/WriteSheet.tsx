// components/WriteSheet.tsx
//
// Docked review panel for items in the Vocabulary surface. Sheet is now a
// read-only navigation panel — it shows the correction and explanation, lets
// the user navigate prev/next, and carries a Delete action in the overflow
// menu. The "Mark as studied / Move back" toggle has been removed along with
// the written_down column.

'use client'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'
import { DockedSheet } from '@/components/DockedSheet'
import { IconButton } from '@/components/IconButton'
import { NavHint } from '@/components/NavHint'
import { HushStack } from '@/components/HushStack'
import { buttonStyles } from '@/components/Button'
import type { PracticeItem } from '@/lib/types'

interface Props {
  item: PracticeItem | null
  hasPrev: boolean
  hasNext: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  /** Permanently deletes the item (undoable via the parent's toast). */
  onDelete: (item: PracticeItem) => Promise<boolean>
  /** When provided, renders "Practise this phrase" as the primary footer button. */
  onPractise?: (item: PracticeItem) => void
}

interface OverflowMenuProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => void
  busy: boolean
  initialFocus?: boolean
  testId?: string
}

function OverflowMenu({
  isOpen, onOpenChange, onDelete,
  busy, initialFocus, testId,
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
          <button
            ref={firstItemRef}
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
  onClose,
  onPrev,
  onNext,
  onDelete,
  onPractise,
}: Props) {
  const { t } = useTranslation()
  const [busyAction, setBusyAction] = useState<'delete' | null>(null)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isOpen = item !== null

  useEffect(() => {
    if (!isOpen) return
    setBusyAction(null)
    setOverflowOpen(false)
    setErrorMessage(null)
  }, [isOpen, item?.id])

  if (!isOpen || !item) return null

  async function handleDelete() {
    if (!item || busyAction) return
    setErrorMessage(null)
    setBusyAction('delete')
    const ok = await onDelete(item)
    if (!ok) {
      setErrorMessage(t('writeList.deleteError'))
    }
    setBusyAction(null)
  }

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
                onDelete={handleDelete}
                busy={busyAction !== null}
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

          <div className="hidden md:flex justify-end">
            <OverflowMenu
              isOpen={overflowOpen}
              onOpenChange={setOverflowOpen}
              onDelete={handleDelete}
              busy={busyAction !== null}
              initialFocus={!onPractise}
              testId="sheet-overflow"
            />
          </div>
        </div>
      </div>

      <div role="status" aria-live="polite" className="mt-4 min-h-[1rem]">
        {errorMessage && (
          <div className="rounded-lg border border-status-error/30 bg-error-container px-3 py-2 space-y-1.5">
            <p id={`ws-err-${item.id}`} className="text-status-error text-sm leading-snug">{errorMessage}</p>
            {typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine && (
              <p className="text-text-tertiary text-xs leading-snug">{t('annotation.offlineNote')}</p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleDelete}
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
