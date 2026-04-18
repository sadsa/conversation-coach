'use client'
import { useEffect, useState } from 'react'
import { WriteList } from '@/components/WriteList'
import { useTranslation } from '@/components/LanguageProvider'
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

  if (loading) return <p className="text-text-tertiary text-sm">{t('write.loading')}</p>
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
