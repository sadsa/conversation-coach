'use client'
import { useState, useEffect, useCallback } from 'react'
import { FlashcardDeck } from '@/components/FlashcardDeck'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

export default function FlashcardsPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // undefined = not yet fetched, null = fetched but no future cards, string = ISO date
  const [nextReviewAt, setNextReviewAt] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    fetch('/api/practice-items?flashcards=due')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setItems(data)
        } else {
          setError(data?.error ?? 'Failed to load flashcards')
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function handleDeleted(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const handleRate = useCallback((id: string, rating: 1 | 3) => {
    fetch(`/api/practice-items/${id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating }),
    }).catch(() => {})
  }, [])

  const handleCaughtUp = useCallback(() => {
    fetch('/api/dashboard-summary')
      .then(r => r.json())
      .then(data => {
        setNextReviewAt(data?.nextReviewAt ?? null)
      })
      .catch(() => setNextReviewAt(null))
  }, [])

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {loading && (
        <p className="text-text-tertiary text-sm px-4">{t('flashcards.loading')}</p>
      )}

      {error && (
        <p className="text-red-400 text-sm px-4">{t('flashcards.error', { msg: error })}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-text-tertiary text-sm px-4">{t('flashcards.empty')}</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="flex flex-col flex-1 justify-center">
          <FlashcardDeck
            items={items}
            onDeleted={handleDeleted}
            onRate={handleRate}
            onCaughtUp={handleCaughtUp}
            nextReviewAt={nextReviewAt}
          />
        </div>
      )}
    </div>
  )
}
