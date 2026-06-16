'use client'
import { useMemo } from 'react'
import { WriteList } from '@/components/WriteList'
import type { PracticeItem } from '@/lib/types'

interface Props {
  items: PracticeItem[]
  onDeleted: (ids: string[]) => void
}

export function VocabularyList({ items, onDeleted }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; items: PracticeItem[] }>()
    for (const item of items) {
      const key = item.session_id
      const title = item.session_title ?? key
      if (!map.has(key)) map.set(key, { title, items: [] })
      map.get(key)!.items.push(item)
    }
    return Array.from(map.values())
  }, [items])

  if (groups.length === 0) {
    return <WriteList items={[]} onDeleted={onDeleted} />
  }

  return (
    <div className="space-y-10">
      {groups.map(group => (
        <section key={group.items[0].session_id}>
          <h2 className="text-sm font-medium text-text-tertiary mb-3 tracking-wide uppercase">
            {group.title}
          </h2>
          <WriteList
            items={group.items}
            onDeleted={onDeleted}
          />
        </section>
      ))}
    </div>
  )
}
