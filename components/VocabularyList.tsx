'use client'
import { useEffect, useMemo, useState } from 'react'
import { WriteList } from '@/components/WriteList'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

interface Props {
  items: PracticeItem[]
  enrichingIds?: Set<string>
  onDeleted: (ids: string[]) => void
  /** True when a status filter or search query is narrowing `items`. */
  filterActive?: boolean
  /** Reset all filters — wired to the "Clear filters" recovery action. */
  onClearFilters?: () => void
}

type BucketId = 'due' | 'toStudy' | 'studied'

const BUCKET_ORDER: BucketId[] = ['due', 'toStudy', 'studied']

// Re-evaluate buckets roughly once a minute so a long-open queue promotes
// items into "Due" as they cross their due time, rather than freezing the
// snapshot taken at first render.
const REBUCKET_INTERVAL_MS = 60_000

function isDue(item: PracticeItem, now: number): boolean {
  return item.due != null && new Date(item.due).getTime() <= now
}

// Order the queue by what the user should act on, not by where the phrase
// came from: due-for-review first, then unstudied, then the studied archive.
// Session provenance is demoted to the review sheet (the "From …" link).
function bucketFor(item: PracticeItem, now: number): BucketId {
  if (isDue(item, now)) return 'due'
  return item.reviewed ? 'studied' : 'toStudy'
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function VocabularyList({
  items,
  enrichingIds,
  onDeleted,
  filterActive = false,
  onClearFilters,
}: Props) {
  const { t } = useTranslation()
  const now = useNow(REBUCKET_INTERVAL_MS)

  const buckets = useMemo(() => {
    const grouped: Record<BucketId, PracticeItem[]> = { due: [], toStudy: [], studied: [] }
    for (const item of items) grouped[bucketFor(item, now)].push(item)
    return grouped
  }, [items, now])

  const label: Record<BucketId, string> = {
    due: t('vocabulary.section.due'),
    toStudy: t('vocabulary.section.toStudy'),
    studied: t('vocabulary.section.studied'),
  }

  if (items.length === 0) {
    // A filter that matches nothing is not the same as an empty vocabulary —
    // point recovery at the filter instead of the first-run onboarding CTA.
    if (filterActive) {
      return (
        <div
          className="py-10 text-center space-y-3"
          data-testid="vocabulary-empty-filtered"
        >
          <p className="text-text-secondary">{t('vocabulary.noMatches')}</p>
          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-accent-primary font-medium hover:underline"
              data-testid="vocabulary-clear-filters"
            >
              {t('vocabulary.clearFilters')}
            </button>
          )}
        </div>
      )
    }
    return <WriteList items={[]} onDeleted={onDeleted} />
  }

  const visible = BUCKET_ORDER.filter(id => buckets[id].length > 0)

  return (
    <div className="space-y-8" data-testid="vocabulary-list">
      {visible.map((id, index) => (
        <section
          key={id}
          data-testid={`vocabulary-bucket-${id}`}
          className="vocab-bucket"
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <h2 className="flex items-baseline gap-2 mb-3 text-sm font-semibold text-text-secondary">
            {label[id]}
            <span className="font-normal text-text-tertiary tabular-nums">{buckets[id].length}</span>
            <span className="sr-only">{t('vocabulary.itemsSuffix')}</span>
          </h2>
          <WriteList
            items={buckets[id]}
            enrichingIds={enrichingIds}
            onDeleted={onDeleted}
          />
        </section>
      ))}
    </div>
  )
}
