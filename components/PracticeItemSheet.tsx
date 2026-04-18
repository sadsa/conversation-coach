// components/PracticeItemSheet.tsx
//
// Docked review panel for practice items. Mirrors AnnotationSheet via the
// shared `DockedSheet` chrome. The primary action is mark-as-written /
// move-back-to-active; delete lives as a quieter secondary action in the
// footer.

'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'
import { DockedSheet } from '@/components/DockedSheet'
import { StrikeOriginal } from '@/components/StrikeOriginal'
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
  const [busyAction, setBusyAction] = useState<'toggle' | 'delete' | null>(null)
  const [importanceExpanded, setImportanceExpanded] = useState(false)

  const isOpen = item !== null

  // Reset transient per-item state whenever the user navigates to a new item
  // or reopens the sheet.
  useEffect(() => {
    if (!isOpen) return
    setImportanceExpanded(false)
    setBusyAction(null)
  }, [isOpen, item?.id])

  if (!isOpen || !item) return null

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
    <DockedSheet
      isOpen={isOpen}
      ariaLabel={t('practiceSheet.aria')}
      onClose={onClose}
      onPrev={onPrev}
      onNext={onNext}
      hasPrev={hasPrev}
      hasNext={hasNext}
      preserveOutsideSelector="[data-practice-item-id]"
      mobileMaxHeight="75vh"
      contentKey={item.id}
      headerLead={
        // Position counter is the lead, the title sits behind it as a small
        // eyebrow label so the heading doesn't fight the body content.
        <div className="flex items-baseline gap-2 min-w-0">
          {position && (
            <span className="text-sm font-medium text-text-primary tabular-nums">
              {t('sheet.position', { n: position.current, total: position.total })}
            </span>
          )}
          <span className="text-[10px] text-text-tertiary uppercase tracking-[0.08em] font-semibold">
            {isArchive ? t('practiceSheet.titleArchive') : t('practiceSheet.titleActive')}
          </span>
        </div>
      }
      footer={
        <div className="flex items-center gap-2">
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
            className="
              w-11 h-11 rounded-xl border border-transparent bg-transparent
              text-status-error/60 hover:text-status-error hover:bg-error-bg/40
              transition-colors flex items-center justify-center disabled:opacity-50
            "
          >
            <Icon name="trash" className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Original → Correction. Shared primitive — same treatment as the
            list rows, so changing one place changes both surfaces in sync. */}
        <StrikeOriginal
          original={item.original}
          correction={item.correction}
          size="sheet"
        />

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
    </DockedSheet>
  )
}
