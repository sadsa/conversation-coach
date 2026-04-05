'use client'
import { useState, useEffect } from 'react'
import { FlashcardDeck } from '@/components/FlashcardDeck'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

export default function FlashcardsPage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function handleDeleted(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setItems(
            data.filter((i: PracticeItem) =>
              i.flashcard_front !== null && i.flashcard_back !== null
            )
          )
        } else {
          setError(data?.error ?? 'Failed to load flashcards')
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {loading && (
        <p className="text-gray-500 text-sm px-4">{t('flashcards.loading')}</p>
      )}

      {error && (
        <p className="text-red-400 text-sm px-4">{t('flashcards.error', { msg: error })}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-gray-500 text-sm px-4">{t('flashcards.empty')}</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="flex flex-col flex-1 justify-center">
          <FlashcardDeck items={items} onDeleted={handleDeleted} />
        </div>
      )}
    </div>
  )
}
