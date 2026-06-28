'use client'
import { useState } from 'react'
import { VocabularyList } from '@/components/VocabularyList'
import { WildCaptureSheet } from '@/components/WildCaptureSheet'
import { IconButton } from '@/components/IconButton'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

interface Props {
  initialItems: PracticeItem[]
  dueCount: number
}

export function VocabularyClient({ initialItems, dueCount }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>(initialItems)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set())

  function handleCapture(id: string, phrase: string) {
    // Optimistically add the new manual item to the list with empty flashcard fields.
    // The enrichment call fires immediately after; when it resolves the item updates.
    const newItem: PracticeItem = {
      id,
      session_id: null,
      annotation_id: null,
      type: 'naturalness',
      original: phrase,
      correction: null,
      explanation: '',
      sub_category: 'vocabulary-choice',
      reviewed: false,
      source: 'manual',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      flashcard_front: null,
      flashcard_back: null,
      flashcard_note: null,
      importance_score: null,
      importance_note: null,
      segment_text: null,
      start_char: null,
      end_char: null,
      session_title: null,
    }
    setItems(prev => [newItem, ...prev])
    setEnrichingIds(prev => { const next = new Set(prev); next.add(id); return next })

    // Fire enrichment without awaiting — update item when it resolves.
    fetch(`/api/practice-items/${id}/enrich`, { method: 'POST' })
      .then(r => r.json())
      .then((enriched: { flashcard_front?: string | null; flashcard_back?: string | null; flashcard_note?: string | null }) => {
        setItems(prev => prev.map(item =>
          item.id === id
            ? {
                ...item,
                flashcard_front: enriched.flashcard_front ?? null,
                flashcard_back: enriched.flashcard_back ?? null,
                flashcard_note: enriched.flashcard_note ?? null,
              }
            : item
        ))
      })
      .catch(() => { /* enrichment failed silently; item still usable */ })
      .finally(() => {
        setEnrichingIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      })
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-page-title">
            {t('vocabulary.title')}
          </h1>
          <IconButton
            icon="plus"
            aria-label={t('vocabulary.addPhrase')}
            size="md"
            variant="bordered"
            onClick={() => setCaptureOpen(true)}
          />
        </div>
        {dueCount > 0 && (
          <p className="inline-block rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
            {t('vocabulary.dueCount', { n: dueCount })}
          </p>
        )}
      </header>
      <VocabularyList
        items={items}
        enrichingIds={enrichingIds}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
      <WildCaptureSheet
        isOpen={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCapture={(id, phrase) => handleCapture(id, phrase)}
      />
    </div>
  )
}
