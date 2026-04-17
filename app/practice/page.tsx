'use client'
import { useEffect, useState } from 'react'
import { PracticeList } from '@/components/PracticeList'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

export default function PracticePage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setItems(data)
        else setError(data?.error ?? 'Failed to load practice items')
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-text-tertiary text-sm">{t('practice.loading')}</p>
  if (error) return <p className="text-status-error text-sm">{t('practice.error', { msg: error })}</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('practice.title')}</h1>
        {items.length === 0 && (
          <p className="text-sm text-text-secondary mt-1">{t('practice.subtitle')}</p>
        )}
      </div>
      <PracticeList
        items={items}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
    </div>
  )
}
