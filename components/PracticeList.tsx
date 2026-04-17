// components/PracticeList.tsx
'use client'
import Link from 'next/link'
import { useState, useEffect, useMemo, useRef } from 'react'
import type { PracticeItem } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'
import { PracticeItemSheet } from '@/components/PracticeItemSheet'
import { StrikeOriginal } from '@/components/StrikeOriginal'
import { Icon } from '@/components/Icon'

const SNIPPET_CONTEXT = 30
const UNDO_TIMEOUT_MS = 5000

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
      className="text-sm italic text-text-tertiary leading-relaxed"
    >
      {snippetStart > 0 && '…'}
      {prefix}
      <span className="not-italic text-text-secondary">{error}</span>
      {suffix}
      {snippetEnd < segmentText.length && '…'}
    </p>
  )
}

type View = 'active' | 'archive'

interface RowProps {
  item: PracticeItem
  isArchive: boolean
  onOpen: () => void
  /** When provided, renders a trailing "mark as written" tap target (Gmail pattern). */
  onMarkWritten?: () => void
}

function PracticeRow({ item, isArchive, onOpen, onMarkWritten }: RowProps) {
  const { t } = useTranslation()
  return (
    <li>
      <div
        className={`
          flex items-stretch rounded-xl border transition-colors
          ${isArchive
            ? 'bg-surface/60 border-border-subtle hover:bg-surface'
            : 'bg-surface border-border-subtle hover:bg-surface-elevated hover:border-border'
          }
        `}
      >
        <button
          type="button"
          onClick={onOpen}
          data-practice-item-id={item.id}
          data-testid={`practice-row-${item.id}`}
          className="flex-1 min-w-0 text-left flex flex-col gap-1.5 px-4 py-3.5 rounded-l-xl"
        >
          <StrikeOriginal
            original={item.original}
            correction={item.correction}
            muted={isArchive}
          />
          {item.segment_text !== null && item.start_char !== null && item.end_char !== null && (
            <ContextSnippet
              segmentText={item.segment_text}
              startChar={item.start_char}
              endChar={item.end_char}
              testId={`context-snippet-${item.id}`}
            />
          )}
        </button>
        {onMarkWritten && (
          <button
            type="button"
            onClick={onMarkWritten}
            aria-label={t('practiceList.markRowAria', { original: item.original })}
            data-testid={`row-mark-written-${item.id}`}
            className="
              self-stretch w-12 flex items-center justify-center rounded-r-xl
              text-text-tertiary hover:text-widget-write-text hover:bg-widget-write-bg/40
              transition-colors
            "
          >
            <Icon name="check" className="w-5 h-5" />
          </button>
        )}
      </div>
    </li>
  )
}

interface SegmentedProps {
  view: View
  activeCount: number
  archiveCount: number
  onChange: (next: View) => void
}

function Segmented({ view, activeCount, archiveCount, onChange }: SegmentedProps) {
  const { t } = useTranslation()
  function segClass(active: boolean) {
    return `
      px-4 py-1.5 rounded-full text-sm transition-colors
      ${active
        ? 'bg-accent-chip text-on-accent-chip'
        : 'text-text-secondary hover:text-text-primary'
      }
    `
  }
  return (
    <div
      role="tablist"
      aria-label={t('practiceList.viewLabel')}
      className="inline-flex rounded-full border border-border bg-surface p-0.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'active'}
        onClick={() => onChange('active')}
        className={segClass(view === 'active')}
      >
        {t('practiceList.active')}{' '}
        <span className="tabular-nums opacity-70">{activeCount}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'archive'}
        onClick={() => onChange('archive')}
        className={segClass(view === 'archive')}
      >
        {t('practiceList.archive')}{' '}
        <span className="tabular-nums opacity-70">{archiveCount}</span>
      </button>
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
  /** Optional initial view — defaults to 'active'. */
  initialView?: View
}

function compareNewestFirst(a: PracticeItem, b: PracticeItem): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function EmptyActive() {
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
          {t('practiceList.emptyActiveCaption')}
        </p>
      </div>
      <p className="text-text-secondary text-sm leading-relaxed">
        <Link href="/" className="text-accent-primary font-medium hover:underline">
          {t('practiceList.emptyActiveCta')}
        </Link>
      </p>
    </div>
  )
}

export function PracticeList({ items, onDeleted, initialView = 'active' }: Props) {
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

  const activeCount = useMemo(
    () => allItems.filter(i => !i.written_down).length,
    [allItems]
  )
  const archiveCount = useMemo(
    () => allItems.filter(i => i.written_down).length,
    [allItems]
  )

  const visible = useMemo(() => {
    return allItems.filter(i =>
      view === 'active' ? !i.written_down : i.written_down
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

  async function handleToggleWritten(item: PracticeItem): Promise<boolean> {
    const previous = item.written_down
    const next = !previous

    setAllItems(prev =>
      prev.map(i => (i.id === item.id ? { ...i, written_down: next } : i))
    )
    setOpenId(null)

    const ok = await patchWritten(item.id, next)
    if (!ok) {
      setAllItems(prev =>
        prev.map(i => (i.id === item.id ? { ...i, written_down: previous } : i))
      )
      showToast(t('practiceList.markWrittenError'))
      return false
    }

    const message = next
      ? t('practiceList.movedToArchive')
      : t('practiceList.movedToActive')

    showToast(message, async () => {
      const reverted = await patchWritten(item.id, previous)
      if (reverted) {
        setAllItems(prev =>
          prev.map(i => (i.id === item.id ? { ...i, written_down: previous } : i))
        )
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast(null)
      } else {
        showToast(t('practiceList.markWrittenError'))
      }
    })

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

    setAllItems(prev => prev.filter(i => i.id !== item.id))
    setOpenId(null)

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
      message: t('practiceList.movedToTrash'),
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
        showToast(t('practiceList.deleteError'))
        return
      }
      onDeleted?.([snapshot.id])
    }, UNDO_TIMEOUT_MS)

    return true
  }

  return (
    <div className="space-y-5">
      <Segmented
        view={view}
        activeCount={activeCount}
        archiveCount={archiveCount}
        onChange={next => {
          setOpenId(null)
          setView(next)
        }}
      />

      {visible.length === 0 ? (
        view === 'active' ? (
          <EmptyActive />
        ) : (
          <p className="text-text-tertiary text-sm py-8 leading-relaxed max-w-prose">
            {t('practiceList.emptyArchive')}
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {visible.map(item => (
            <PracticeRow
              key={item.id}
              item={item}
              isArchive={view === 'archive'}
              onOpen={() => setOpenId(item.id)}
              onMarkWritten={
                view === 'active' ? () => handleToggleWritten(item) : undefined
              }
            />
          ))}
        </ul>
      )}

      <PracticeItemSheet
        item={openItem}
        position={openItem ? { current: openIndex + 1, total: visible.length } : null}
        hasPrev={hasPrev}
        hasNext={hasNext}
        isArchive={view === 'archive'}
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
        <div
          key={toast.key}
          role="alert"
          className="
            fixed bottom-[var(--toast-bottom)] left-1/2 -translate-x-1/2 z-50
            flex items-center gap-3 px-4 py-2.5
            bg-surface-elevated border border-border rounded-xl
            text-sm text-text-primary shadow-lg
            animate-toast-in
          "
        >
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button
              type="button"
              onClick={() => toast.onUndo?.()}
              className="text-accent-primary font-medium hover:underline"
            >
              {t('practiceList.undo')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
