// app/flashcards/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { LeitnerDashboard } from '@/components/LeitnerDashboard'
import { useTranslation } from '@/components/LanguageProvider'
import type { LeitnerResponse } from '@/lib/types'

export default function FlashcardsPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<LeitnerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/practice-items?flashcards=due')
      .then(r => r.json())
      .then((json: LeitnerResponse) => {
        if (json && Array.isArray(json.boxes)) {
          setData(json)
        } else {
          setError('Failed to load flashcards')
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="px-4 py-6">
      {loading && (
        <p className="text-text-tertiary text-sm">{t('flashcards.loading')}</p>
      )}
      {error && (
        <p className="text-red-400 text-sm">{t('flashcards.error', { msg: error })}</p>
      )}
      {!loading && !error && data && (
        <LeitnerDashboard
          boxes={data.boxes}
          cards={data.cards}
          activeBox={data.activeBox}
        />
      )}
    </div>
  )
}
