'use client'
import { useState } from 'react'
import type { PracticeItem, AnnotationType } from '@/lib/types'

const TYPE_ICON: Record<AnnotationType, string> = {
  grammar: '🔴',
  naturalness: '🟡',
  strength: '🟢',
}

interface ItemWithSession extends PracticeItem {
  sessions?: { title: string; created_at: string }
}

interface Props {
  items: ItemWithSession[]
  onToggleReviewed: (id: string, reviewed: boolean) => void
  onDelete: (id: string) => void
}

type Filter = 'all' | AnnotationType
type ReviewedFilter = 'all' | 'pending' | 'reviewed'

export function PracticeList({ items, onToggleReviewed, onDelete }: Props) {
  const [typeFilter, setTypeFilter] = useState<Filter>('all')
  const [reviewedFilter, setReviewedFilter] = useState<ReviewedFilter>('all')

  const filtered = items.filter(item => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (reviewedFilter === 'pending' && item.reviewed) return false
    if (reviewedFilter === 'reviewed' && !item.reviewed) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap text-sm">
        {(['all', 'grammar', 'naturalness', 'strength'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-3 py-1 rounded-full border transition-colors capitalize ${
              typeFilter === f ? 'border-violet-500 text-violet-300 bg-violet-500/10' : 'border-gray-700 text-gray-400'
            }`}
          >
            {f}
          </button>
        ))}
        <div className="w-px bg-gray-700 mx-1" />
        {(['all', 'pending', 'reviewed'] as ReviewedFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setReviewedFilter(f)}
            className={`px-3 py-1 rounded-full border transition-colors capitalize ${
              reviewedFilter === f ? 'border-violet-500 text-violet-300 bg-violet-500/10' : 'border-gray-700 text-gray-400'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-500 text-sm">No items match this filter.</p>
      )}

      <ul className="space-y-2">
        {filtered.map(item => (
          <li key={item.id} className="flex items-start gap-3 p-4 bg-gray-900 rounded-xl">
            <span className="text-lg mt-0.5">{TYPE_ICON[item.type]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                {item.correction ? (
                  <>
                    <span className="line-through text-gray-500">{item.original}</span>
                    {' → '}
                    <span className="font-medium">{item.correction}</span>
                  </>
                ) : (
                  <span className="text-green-300">&ldquo;{item.original}&rdquo;</span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1">{item.explanation}</p>
              {item.sessions && (
                <p className="text-xs text-gray-600 mt-1">
                  {item.sessions.title} · {new Date(item.sessions.created_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="checkbox"
                checked={item.reviewed}
                onChange={e => onToggleReviewed(item.id, e.target.checked)}
                className="w-4 h-4 rounded accent-violet-500 cursor-pointer"
                aria-label="Mark reviewed"
              />
              <button
                onClick={() => onDelete(item.id)}
                className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                aria-label="Delete item"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
