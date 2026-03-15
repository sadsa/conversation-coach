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

  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.json())
      .then(setItems)
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
