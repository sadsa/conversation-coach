'use client'
import { useState, useMemo } from 'react'
import { VocabularyList } from '@/components/VocabularyList'
import { WildCaptureSheet } from '@/components/WildCaptureSheet'
import { IconButton } from '@/components/IconButton'
import { FilterBar } from '@/components/FilterBar'
import { useTranslation } from '@/components/LanguageProvider'
import { filterVocabularyItems, type VocabularyFilterState, type VocabularyStatusFilter } from '@/lib/vocabulary-filter'
import { DueWidget } from '@/components/DueWidget'
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
  const [filterState, setFilterState] = useState<VocabularyFilterState>({
    statusFilters: [],
    searchQuery: '',
  })

  const filteredItems = useMemo(
    () => filterVocabularyItems(items, filterState),
    [items, filterState],
  )

  const filterOptions = [
    { value: 'unstudied', label: t('vocabulary.filter.unstudied') },
    { value: 'due', label: t('vocabulary.filter.due') },
    { value: 'studied', label: t('vocabulary.filter.studied') },
  ]

  function handleCapture(id: string, phrase: string) {
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
      </header>
      <FilterBar
        searchQuery={filterState.searchQuery}
        searchPlaceholder={t('vocabulary.filter.searchPlaceholder')}
        filterOptions={filterOptions}
        activeFilters={filterState.statusFilters}
        onSearchChange={q => setFilterState(prev => ({ ...prev, searchQuery: q }))}
        onFilterAdd={v => setFilterState(prev => ({
          ...prev,
          statusFilters: [...prev.statusFilters, v as VocabularyStatusFilter],
        }))}
        onFilterRemove={v => setFilterState(prev => ({
          ...prev,
          statusFilters: prev.statusFilters.filter(f => f !== v),
        }))}
        filterButtonLabel={t('vocabulary.filter.button')}
      />
      <DueWidget dueCount={dueCount} />
      <VocabularyList
        items={filteredItems}
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
