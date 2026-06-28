'use client'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
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
  enriching?: boolean
  onOpen: () => void
  onDelete: () => void
}

function WriteRow({ item, enriching, onOpen, onDelete }: RowProps) {
  const { t } = useTranslation()

  const actions: RowAction[] = [
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
          className={`w-full min-w-0 text-left pl-4 pr-12 py-3 bg-surface hover:bg-surface-elevated transition-colors${!item.reviewed ? ' font-semibold' : ''}`}
        >
          {enriching ? (
            <div className="space-y-1">
              {item.original && (
                <span className="block text-sm">{item.original}</span>
              )}
              <span className="text-xs text-text-tertiary italic animate-pulse">
                {t('vocabulary.enriching')}
              </span>
            </div>
          ) : item.flashcard_front && item.flashcard_back ? (
            <FlashcardRow
              flashcardFront={item.flashcard_front}
              flashcardBack={item.flashcard_back}
              muted={item.reviewed}
              testId={`flashcard-row-${item.id}`}
            />
          ) : item.segment_text !== null && item.start_char !== null && item.end_char !== null ? (
            <CorrectionInContext
              segmentText={item.segment_text}
              startChar={item.start_char}
              endChar={item.end_char}
              original={item.original}
              correction={item.correction}
              testId={`correction-in-context-${item.id}`}
            />
          ) : (
            <StrikeOriginal
              original={item.original}
              correction={item.correction}
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
  enrichingIds?: Set<string>
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

export function WriteList({ items, enrichingIds, onDeleted, onPractise }: Props) {
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

  const openItem = openId !== null ? allItems.find(i => i.id === openId) ?? null : null
  const openIndex = openId !== null ? allItems.findIndex(i => i.id === openId) : -1
  const hasPrev = openIndex > 0
  const hasNext = openIndex >= 0 && openIndex < allItems.length - 1

  function showToast(message: string, onUndo?: () => void | Promise<void>) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, onUndo, key: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), UNDO_TIMEOUT_MS)
  }

  function nextOpenIdAfter(itemId: string): string | null {
    if (openId === null) return null
    const idx = allItems.findIndex(i => i.id === itemId)
    if (idx < 0 || idx + 1 >= allItems.length) return null
    return allItems[idx + 1].id
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
      {allItems.length === 0 ? (
        <EmptyWrite />
      ) : (
        <ul className="space-y-2">
          {allItems.map(item => (
            <WriteRow
              key={item.id}
              item={item}
              enriching={enrichingIds?.has(item.id)}
              onOpen={() => setOpenId(item.id)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </ul>
      )}

      <WriteSheet
        item={openItem}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onClose={() => setOpenId(null)}
        onPrev={() => {
          if (hasPrev) setOpenId(allItems[openIndex - 1].id)
        }}
        onNext={() => {
          if (hasNext) setOpenId(allItems[openIndex + 1].id)
        }}
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
