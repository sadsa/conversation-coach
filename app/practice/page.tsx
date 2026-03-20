'use client'
import { useEffect, useState } from 'react'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'

// The API returns items with a joined `sessions` field — extend the base type here
type PracticeItemWithSession = PracticeItem & {
  sessions?: { title: string; created_at: string }
}

export default function PracticePage() {
  const [items, setItems] = useState<PracticeItemWithSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setItems(data)
        } else {
          setError(data?.error ?? 'Failed to load practice items')
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleToggleReviewed(id: string, reviewed: boolean) {
    await fetch(`/api/practice-items/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewed }),
    })
    setItems(prev => prev.map(i => i.id === id ? { ...i, reviewed } : i))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/practice-items/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>
  if (error) return <p className="text-red-400 text-sm">Error: {error}</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Practice Items</h1>
        <p className="text-sm text-gray-400 mt-1">
          {items.length} item{items.length !== 1 ? 's' : ''} across all sessions
        </p>
      </div>
      <PracticeList
        items={items}
        onToggleReviewed={handleToggleReviewed}
        onDelete={handleDelete}
      />
    </div>
  )
}
