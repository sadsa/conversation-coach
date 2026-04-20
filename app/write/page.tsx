'use client'
import { useEffect, useState } from 'react'
import { WriteList } from '@/components/WriteList'
import { useTranslation } from '@/components/LanguageProvider'
import { Skeleton, SkeletonRow } from '@/components/Skeleton'
import type { PracticeItem } from '@/lib/types'

export default function WritePage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setItems(data)
        else setError(data?.error ?? 'Failed to load saved corrections')
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Replace the old "Loading…" text line with a skeleton that mirrors the
  // page's actual shape (title + view-toggle row + a few rows). Keeps the
  // surface from collapsing into a tiny grey label during the fetch and
  // gives the user a sense of how the page will land.
  if (loading) {
    return (
      <div
        className="space-y-6 animate-pulse"
        aria-busy="true"
        aria-label={t('write.loading')}
      >
        <Skeleton tone="elevated" className="h-7 w-24" radius="md" />
        <div className="flex justify-end">
          <Skeleton tone="elevated" className="h-5 w-28" radius="full" />
        </div>
        <div className="space-y-2">
          <SkeletonRow titleWidth="w-5/6" subtitleWidth={null} />
          <SkeletonRow titleWidth="w-3/4" subtitleWidth={null} />
          <SkeletonRow titleWidth="w-2/3" subtitleWidth={null} />
        </div>
      </div>
    )
  }
  if (error) return <p className="text-status-error text-sm">{t('write.error', { msg: error })}</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('write.title')}</h1>
        {items.length === 0 && (
          <p className="text-sm text-text-secondary mt-1">{t('write.subtitle')}</p>
        )}
      </div>
      <WriteList
        items={items}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
    </div>
  )
}
