'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FlashcardDeck } from '@/components/FlashcardDeck'
import type { PracticeItem } from '@/lib/types'

export default function FlashcardsPage() {
  const [items, setItems] = useState<PracticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      <div className="flex items-center px-4 pt-4 pb-2">
        <Link href="/" className="text-gray-400 hover:text-gray-200 text-sm">
          ← Back
        </Link>
      </div>

      {loading && (
        <p className="text-gray-500 text-sm px-4">Loading…</p>
      )}

      {error && (
        <p className="text-red-400 text-sm px-4">Error: {error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-gray-500 text-sm px-4">
          No flashcards yet — complete a session to generate cards.
        </p>
      )}

      {!loading && items.length > 0 && (
        <FlashcardDeck items={items} />
      )}
    </div>
  )
}
