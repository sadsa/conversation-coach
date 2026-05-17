// components/WriteList.tsx
//
// The "Write" surface: a queue of saved corrections waiting to be
// written down on paper. Two views: Write (active, not-yet-written)
// and Written (archive). The data noun is still `practice_items`
// in the DB and API — only the user-facing surface is named "Write"
// because writing is the action the user takes from this page.
'use client'
import Link from 'next/link'
import { useState, useEffect, useMemo, useRef } from 'react'
import type { PracticeItem } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'
import { WriteSheet } from '@/components/WriteSheet'
import { StrikeOriginal } from '@/components/StrikeOriginal'
import { CorrectionInContext } from '@/components/CorrectionInContext'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'

const UNDO_TIMEOUT_MS = 5000

type View = 'write' | 'written'

interface RowProps {
  item: PracticeItem
  isWritten: boolean
  onOpen: () => void
  /** When provided, renders a trailing "mark as written" tap target (Gmail pattern). */
  onMarkWritten?: () => void
}

function WriteRow({ item, isWritten, onOpen, onMarkWritten }: RowProps) {
  const { t } = useTranslation()
  return (
    <li>
      <div
        className={`
          flex items-stretch rounded-xl border transition-colors
          ${isWritten
            ? 'bg-surface/60 border-border-subtle hover:bg-surface'
            : 'bg-surface border-border-subtle hover:bg-surface-elevated hover:border-border'
          }
        `}
      >
        <button
          type="button"
          onClick={onOpen}
          data-write-item-id={item.id}
          data-testid={`write-row-${item.id}`}
          className="flex-1 min-w-0 text-left px-4 py-3 rounded-l-xl"
        >
          {/* Single-block "correction in context" — sentence with the wrong
              fragment struck through and the rewrite inserted right after.
              Falls back to the bare wrong → right pair for items without
              segment data so older entries still render meaningfully. */}
          {item.segment_text !== null && item.start_char !== null && item.end_char !== null ? (
            <CorrectionInContext
              segmentText={item.segment_text}
              startChar={item.start_char}
              endChar={item.end_char}
              original={item.original}
              correction={item.correction}
              muted={isWritten}
              testId={`correction-in-context-${item.id}`}
            />
          ) : (
            <StrikeOriginal
              original={item.original}
              correction={item.correction}
              muted={isWritten}
            />
          )}
        </button>
        {onMarkWritten && (
          // Trailing fast-path action. Visually separated from the row body
          // by a faint left rule so touch users can see it's a distinct tap
          // target (icon-only buttons against an unbordered cell read as
          // empty space without the divider). On md+ a "Done" micro-label
          // teaches the affordance without adding mobile clutter.
          <button
            type="button"
            onClick={onMarkWritten}
            aria-label={t('writeList.markRowAria', { original: item.original })}
            data-testid={`row-mark-written-${item.id}`}
            className="
              self-stretch flex items-center justify-center gap-1.5
              px-3 md:px-4 rounded-r-xl
              border-l border-border-subtle
              text-text-secondary hover:text-widget-write-text
              hover:bg-widget-write-bg/50 hover:border-widget-write-border/40
              transition-colors
            "
          >
            <Icon name="check" className="w-5 h-5" />
            <span className="hidden md:inline text-xs font-medium">
              {t('writeList.markDoneShort')}
            </span>
          </button>
        )}
      </div>
    </li>
  )
}

interface ViewToggleProps {
  view: View
  writeCount: number
  writtenCount: number
  onChange: (next: View) => void
}

/**
 * Asymmetric view header. The Write list is the primary surface so it
 * never gets a "tab"; the page H1 already names it. The Written archive
 * lives behind a quiet right-aligned link that flips to it (with a
 * matching back-link the other way). This kills the tab-equality of the
 * old segmented control — fewer pixels of chrome on the surface the user
 * cares about most, and the archive becomes a small reward count rather
 * than a peer destination.
 */
function ViewToggle({ view, writeCount, writtenCount, onChange }: ViewToggleProps) {
  const { t } = useTranslation()
  return (
    <div
      role="group"
      aria-label={t('writeList.viewLabel')}
      data-testid="view-toggle"
      className="flex items-center justify-between gap-3 min-h-[28px]"
    >
      {view === 'write' ? (
        // Write view: leading slot is empty (page H1 already says "Write");
        // the count lives next to the nav target so it reads as one unit.
        <span aria-hidden="true" />
      ) : (
        <span className="flex items-center gap-2 text-sm text-text-secondary">
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full bg-widget-write-text"
          />
          <span className="font-medium text-text-primary">
            {t('writeList.archiveHeading')}
          </span>
          <span className="text-text-tertiary tabular-nums">{writtenCount}</span>
        </span>
      )}

      {view === 'write' ? (
        writtenCount > 0 && (
          <button
            type="button"
            data-testid="view-toggle-to-written"
            onClick={() => onChange('written')}
            className="
              text-sm text-text-tertiary hover:text-text-primary
              transition-colors inline-flex items-center gap-1
              focus-visible:underline
            "
          >
            <span className="tabular-nums">{writtenCount}</span>
            {' '}
            {t('writeList.archiveLink')}
            <span aria-hidden="true">→</span>
          </button>
        )
      ) : (
        <button
          type="button"
          data-testid="view-toggle-to-write"
          onClick={() => onChange('write')}
          className="
            text-sm text-text-tertiary hover:text-text-primary
            transition-colors inline-flex items-center gap-1
            focus-visible:underline
          "
        >
          <span aria-hidden="true">←</span>
          {t('writeList.backToWrite')}
          <span className="tabular-nums text-text-tertiary">{writeCount}</span>
        </button>
      )}
    </div>
  )
}

interface ToastState {
  message: string
  onUndo?: () => void | Promise<void>
  key: number
}

interface Props {
  items: PracticeItem[]
  /** Called once an item is *fully* gone (after the undo window expires). */
  onDeleted?: (ids: string[]) => void
  /** Optional initial view — defaults to 'write' (the not-yet-written queue). */
  initialView?: View
}

function compareNewestFirst(a: PracticeItem, b: PracticeItem): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function EmptyWrite() {
  const { t } = useTranslation()
  return (
    <div className="py-6 space-y-5 max-w-prose">
      {/* Faded example row — same visual grammar as the real rows so the
          empty state teaches by showing, not just telling. */}
      <div
        className="rounded-xl border border-border-subtle bg-surface px-4 py-3.5 opacity-70"
        aria-hidden="true"
      >
        <StrikeOriginal original="Yo fui" correction="Fui" />
        <p className="text-sm italic text-text-tertiary leading-relaxed mt-1.5">
          {t('writeList.emptyWriteCaption')}
        </p>
      </div>
      <p className="text-text-secondary text-sm leading-relaxed">
        {/* Points at /review (the conversations inbox) — the user opens a
            conversation there, saves a correction inside the transcript,
            and it lands back in this queue. Used to point at `/`, which
            is now the Practise picker after the home redesign and would
            send the user a tab away from where the saved-correction
            workflow actually starts. */}
        <Link href="/review" className="text-accent-primary font-medium hover:underline">
          {t('writeList.emptyWriteCta')}
        </Link>
      </p>
    </div>
  )
}

interface EmptyWrittenProps {
  writeCount: number
  onBack: () => void
}

/**
 * Parity with EmptyWrite — instead of a single grey line, the empty
 * archive shows a small "what lives here" block plus a way back. The
 * caption mirrors EmptyWrite's "this is what these look like" rhythm.
 */
function EmptyWritten({ writeCount, onBack }: EmptyWrittenProps) {
  const { t } = useTranslation()
  return (
    <div className="py-6 space-y-5 max-w-prose">
      <div
        className="rounded-xl border border-border-subtle bg-surface/60 px-4 py-3.5 opacity-70"
        aria-hidden="true"
      >
        <StrikeOriginal original="Yo fui" correction="Fui" muted />
        <p className="text-sm italic text-text-tertiary leading-relaxed mt-1.5">
          {t('writeList.emptyWrittenCaption')}
        </p>
      </div>
      {writeCount > 0 ? (
        <p className="text-text-secondary text-sm leading-relaxed">
          <button
            type="button"
            onClick={onBack}
            className="text-accent-primary font-medium hover:underline"
          >
            {t('writeList.emptyWrittenCta', { count: writeCount })}
          </button>
        </p>
      ) : (
        <p className="text-text-secondary text-sm leading-relaxed">
          {t('writeList.emptyWrittenNoQueue')}
        </p>
      )}
    </div>
  )
}

export function WriteList({ items, onDeleted, initialView = 'write' }: Props) {
  const { t } = useTranslation()
  const [view, setView] = useState<View>(initialView)
  const [allItems, setAllItems] = useState<PracticeItem[]>(items)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync items prop into local state. Local state lets us optimistically flip
  // written_down or hide deleted rows without round-tripping through the parent.
  useEffect(() => {
    setAllItems(items)
  }, [items])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const writeCount = useMemo(
    () => allItems.filter(i => !i.written_down).length,
    [allItems]
  )
  const writtenCount = useMemo(
    () => allItems.filter(i => i.written_down).length,
    [allItems]
  )

  const visible = useMemo(() => {
    return allItems.filter(i =>
      view === 'write' ? !i.written_down : i.written_down
    )
  }, [allItems, view])

  const openIndex = openId !== null ? visible.findIndex(i => i.id === openId) : -1
  const openItem = openIndex >= 0 ? visible[openIndex] : null
  const hasPrev = openIndex > 0
  const hasNext = openIndex >= 0 && openIndex < visible.length - 1

  function showToast(message: string, onUndo?: () => void | Promise<void>) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, onUndo, key: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), UNDO_TIMEOUT_MS)
  }

  async function patchWritten(id: string, written: boolean): Promise<boolean> {
    const res = await fetch(`/api/practice-items/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ written_down: written }),
    })
    return res.ok
  }

  /**
   * For sheet-driven actions we want Gmail's "archive-and-next" behavior:
   * after the user marks the open item, the sheet doesn't slam shut — it
   * replaces its body with the next item in the *current* list. If they're
   * already at the last item, the sheet closes naturally (nothing to advance
   * to). Row-driven actions (where the sheet was never open) keep their
   * stay-on-the-list behavior.
   *
   * `currentVisible` MUST be captured BEFORE the optimistic state mutation,
   * because the post-mutation list will have already removed `item` and the
   * "next" computation would then point at the wrong row.
   */
  function nextOpenIdAfter(itemId: string): string | null {
    if (openId === null) return null
    const idx = visible.findIndex(i => i.id === itemId)
    if (idx < 0 || idx + 1 >= visible.length) return null
    return visible[idx + 1].id
  }

  /**
   * Mark-written / move-back is intentionally silent on success — the row
   * disappears from the current tab and (for sheet-driven calls) the sheet
   * auto-advances to the next item, which is more confirmation than the
   * user needs. Only error paths surface a toast: the action looked like it
   * worked optimistically, so the user has to know we rolled it back.
   */
  async function handleToggleWritten(item: PracticeItem): Promise<boolean> {
    const previous = item.written_down
    const next = !previous
    const wasOpen = openId === item.id
    const advanceToId = nextOpenIdAfter(item.id)

    setAllItems(prev =>
      prev.map(i => (i.id === item.id ? { ...i, written_down: next } : i))
    )
    setOpenId(wasOpen ? advanceToId : null)

    const ok = await patchWritten(item.id, next)
    if (!ok) {
      setAllItems(prev =>
        prev.map(i => (i.id === item.id ? { ...i, written_down: previous } : i))
      )
      showToast(t('writeList.markWrittenError'))
      return false
    }

    return true
  }

  /**
   * Optimistic delete with an undo window:
   *   1. hide the row immediately + show toast with Undo
   *   2. only fire DELETE after UNDO_TIMEOUT_MS if not cancelled
   *   3. if Undo is clicked, restore the row in place; no network call ever happens
   *   4. if DELETE fails, restore the row + show an error toast
   *
   * Returning quickly (vs. awaiting the network) keeps the sheet's busy state
   * snappy; the parent's `onDeleted` is only called once the row is truly gone.
   */
  async function handleDelete(item: PracticeItem): Promise<boolean> {
    const snapshot = item
    const wasOpen = openId === item.id
    const advanceToId = nextOpenIdAfter(item.id)

    setAllItems(prev => prev.filter(i => i.id !== item.id))
    setOpenId(wasOpen ? advanceToId : null)

    let cancelled = false
    let pendingDeleteTimer: ReturnType<typeof setTimeout> | null = null

    function restoreRow() {
      setAllItems(prev =>
        prev.find(i => i.id === snapshot.id)
          ? prev
          : [...prev, snapshot].sort(compareNewestFirst)
      )
    }

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({
      key: Date.now(),
      message: t('writeList.movedToTrash'),
      onUndo: () => {
        cancelled = true
        if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer)
        restoreRow()
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast(null)
      },
    })
    toastTimerRef.current = setTimeout(() => setToast(null), UNDO_TIMEOUT_MS)

    pendingDeleteTimer = setTimeout(async () => {
      if (cancelled) return
      const res = await fetch(`/api/practice-items/${snapshot.id}`, { method: 'DELETE' })
      if (!res.ok) {
        restoreRow()
        showToast(t('writeList.deleteError'))
        return
      }
      onDeleted?.([snapshot.id])
    }, UNDO_TIMEOUT_MS)

    return true
  }

  return (
    <div className="space-y-5">
      <ViewToggle
        view={view}
        writeCount={writeCount}
        writtenCount={writtenCount}
        onChange={next => {
          setOpenId(null)
          setView(next)
        }}
      />

      {visible.length === 0 ? (
        view === 'write' ? (
          <EmptyWrite />
        ) : (
          <EmptyWritten writeCount={writeCount} onBack={() => setView('write')} />
        )
      ) : (
        <ul className="space-y-2">
          {visible.map(item => (
            <WriteRow
              key={item.id}
              item={item}
              isWritten={view === 'written'}
              onOpen={() => setOpenId(item.id)}
              onMarkWritten={
                view === 'write' ? () => handleToggleWritten(item) : undefined
              }
            />
          ))}
        </ul>
      )}

      <WriteSheet
        item={openItem}
        position={openItem ? { current: openIndex + 1, total: visible.length } : null}
        hasPrev={hasPrev}
        hasNext={hasNext}
        isWritten={view === 'written'}
        onClose={() => setOpenId(null)}
        onPrev={() => {
          if (hasPrev) setOpenId(visible[openIndex - 1].id)
        }}
        onNext={() => {
          if (hasNext) setOpenId(visible[openIndex + 1].id)
        }}
        onToggleWritten={handleToggleWritten}
        onDelete={handleDelete}
      />

      {toast && (
        <Toast
          toastKey={toast.key}
          message={toast.message}
          action={toast.onUndo ? { label: t('writeList.undo'), onClick: toast.onUndo } : undefined}
        />
      )}
    </div>
  )
}
