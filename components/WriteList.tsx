'use client'
import Link from 'next/link'
import { useState, useEffect, useMemo, useRef } from 'react'
import type { PracticeItem, TargetLanguage } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'
import { WriteSheet } from '@/components/WriteSheet'
import { StrikeOriginal } from '@/components/StrikeOriginal'
import { CorrectionInContext } from '@/components/CorrectionInContext'
import { FlashcardRow } from '@/components/FlashcardRow'
import { RowActionsMenu, type RowAction } from '@/components/RowActionsMenu'
import { Toast } from '@/components/Toast'

const UNDO_TIMEOUT_MS = 5000

const EMPTY_STATE_EXAMPLE: Record<TargetLanguage, { original: string; correction: string }> = {
  'es-AR': { original: 'Yo fui', correction: 'Fui' },
  'en-NZ': { original: 'I have hunger', correction: "I'm hungry" },
}

interface RowProps {
  item: PracticeItem
  isWritten: boolean
  onOpen: () => void
  onMarkWritten: () => void
  onDelete: () => void
}

function WriteRow({ item, isWritten, onOpen, onMarkWritten, onDelete }: RowProps) {
  const { t } = useTranslation()

  const actions: RowAction[] = [
    {
      label: isWritten ? t('writeList.menuMoveBack') : t('writeList.menuMarkStudied'),
      onSelect: onMarkWritten,
      testId: `row-mark-written-${item.id}`,
    },
    {
      label: t('writeList.menuDelete'),
      onSelect: onDelete,
      destructive: true,
      testId: `row-delete-${item.id}`,
    },
  ]

  return (
    <li className="relative group">
      <div className="rounded-xl border border-border-subtle hover:border-border transition-colors overflow-hidden">
        <button
          type="button"
          onClick={onOpen}
          data-write-item-id={item.id}
          data-testid={`write-row-${item.id}`}
          className={`w-full min-w-0 text-left pl-4 pr-12 py-3 ${
            isWritten ? 'bg-surface/60 hover:bg-surface' : 'bg-surface hover:bg-surface-elevated'
          } transition-colors`}
        >
          {item.flashcard_front && item.flashcard_back ? (
            <FlashcardRow
              flashcardFront={item.flashcard_front}
              flashcardBack={item.flashcard_back}
              muted={isWritten}
              testId={`flashcard-row-${item.id}`}
            />
          ) : item.segment_text !== null && item.start_char !== null && item.end_char !== null ? (
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
      </div>

      <RowActionsMenu
        actions={actions}
        triggerLabel={t('writeList.menuAria')}
        triggerTestId={`write-row-menu-${item.id}`}
      />
    </li>
  )
}

interface ToastState {
  message: string
  onUndo?: () => void | Promise<void>
  key: number
}

interface Props {
  items: PracticeItem[]
  onDeleted?: (ids: string[]) => void
  onPractise?: (item: PracticeItem) => void
}

function compareNewestFirst(a: PracticeItem, b: PracticeItem): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function EmptyWrite() {
  const { t, targetLanguage } = useTranslation()
  const example = EMPTY_STATE_EXAMPLE[targetLanguage]
  return (
    <div className="py-6 space-y-5 max-w-prose">
      <div
        className="rounded-xl border border-border-subtle bg-surface px-4 py-3.5 opacity-70"
        aria-hidden="true"
      >
        <StrikeOriginal original={example.original} correction={example.correction} />
        <p className="text-sm italic text-text-tertiary leading-relaxed mt-1.5">
          {t('writeList.emptyWriteCaption')}
        </p>
      </div>
      <p className="text-text-secondary text-sm leading-relaxed">
        <Link href="/" className="text-accent-primary font-medium hover:underline">
          {t('writeList.emptyWriteCta')}
        </Link>
      </p>
    </div>
  )
}

export function WriteList({ items, onDeleted, onPractise }: Props) {
  const { t } = useTranslation()
  const [allItems, setAllItems] = useState<PracticeItem[]>(items)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setAllItems(items)
  }, [items])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const activeItems = useMemo(
    () => allItems.filter(i => !i.written_down),
    [allItems]
  )
  const studiedItems = useMemo(
    () => allItems.filter(i => i.written_down),
    [allItems]
  )

  const openItem = openId !== null ? allItems.find(i => i.id === openId) ?? null : null
  const navItems = (openItem?.written_down ?? false) ? studiedItems : activeItems
  const openIndex = openId !== null ? navItems.findIndex(i => i.id === openId) : -1
  const hasPrev = openIndex > 0
  const hasNext = openIndex >= 0 && openIndex < navItems.length - 1

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

  function nextOpenIdAfter(itemId: string): string | null {
    if (openId === null) return null
    const idx = navItems.findIndex(i => i.id === itemId)
    if (idx < 0 || idx + 1 >= navItems.length) return null
    return navItems[idx + 1].id
  }

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
      {activeItems.length === 0 && allItems.length > 0 ? (
        <div className="py-6 space-y-3 max-w-prose">
          <p className="text-text-secondary text-sm leading-relaxed">
            {t('writeList.allStudiedHeading')}
          </p>
          <p className="text-text-secondary text-sm leading-relaxed">
            <Link href="/" className="text-accent-primary font-medium hover:underline">
              {t('writeList.allStudiedCta')}
            </Link>
          </p>
        </div>
      ) : activeItems.length === 0 ? (
        <EmptyWrite />
      ) : (
        <ul className="space-y-2">
          {activeItems.map(item => (
            <WriteRow
              key={item.id}
              item={item}
              isWritten={false}
              onOpen={() => setOpenId(item.id)}
              onMarkWritten={() => handleToggleWritten(item)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </ul>
      )}

      {studiedItems.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 pt-1" data-testid="studied-divider">
            <h2 className="text-xs font-medium text-text-tertiary tracking-wide">
              {t('writeList.archiveHeading')}
            </h2>
            <span className="text-xs text-text-tertiary tabular-nums" aria-label={`${studiedItems.length} items`}>
              · {studiedItems.length}
            </span>
          </div>
          <ul className="space-y-2 -mt-3" aria-label={t('writeList.archiveHeading')}>
            {studiedItems.map(item => (
              <WriteRow
                key={item.id}
                item={item}
                isWritten={true}
                onOpen={() => setOpenId(item.id)}
                onMarkWritten={() => handleToggleWritten(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </ul>
        </>
      )}

      <WriteSheet
        item={openItem}
        hasPrev={hasPrev}
        hasNext={hasNext}
        isWritten={openItem?.written_down ?? false}
        onClose={() => setOpenId(null)}
        onPrev={() => {
          if (hasPrev) setOpenId(navItems[openIndex - 1].id)
        }}
        onNext={() => {
          if (hasNext) setOpenId(navItems[openIndex + 1].id)
        }}
        onToggleWritten={handleToggleWritten}
        onDelete={handleDelete}
        onPractise={onPractise}
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
