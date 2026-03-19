// app/practice/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'

export default function PracticePage() {
  const [items, setItems] = useState<PracticeItem[]>([])
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
        onDeleted={ids =>
          setItems(prev => prev.filter(i => !ids.includes(i.id)))
        }
      />
    </div>
  )
}
