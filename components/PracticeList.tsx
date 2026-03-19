// components/PracticeList.tsx
'use client'
import { useState } from 'react'
import type { PracticeItem, AnnotationType } from '@/lib/types'

const TYPE_DOT_CLASS: Record<AnnotationType, string> = {
  grammar: 'bg-red-400',
  naturalness: 'bg-yellow-400',
  strength: 'bg-green-400',
}

type Filter = 'all' | AnnotationType

interface Props {
  items: PracticeItem[]
}

export function PracticeList({ items }: Props) {
  const [typeFilter, setTypeFilter] = useState<Filter>('all')

  const filtered = items.filter(item =>
    typeFilter === 'all' || item.type === typeFilter
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap text-sm">
        {(['all', 'grammar', 'naturalness', 'strength'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-3 py-1 rounded-full border transition-colors capitalize ${
              typeFilter === f
                ? 'border-violet-500 text-violet-300 bg-violet-500/10'
                : 'border-gray-700 text-gray-400'
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
          <li key={item.id} className="flex items-center gap-3 px-4 py-3 bg-gray-900 rounded-xl">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_DOT_CLASS[item.type]}`} />
            <div className="flex-1 min-w-0 text-sm">
              {item.correction ? (
                <>
                  <span className="line-through text-gray-500">{item.original}</span>
                  {' → '}
                  <span className="font-medium">{item.correction}</span>
                </>
              ) : (
                <span className="text-green-300">&ldquo;{item.original}&rdquo;</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
