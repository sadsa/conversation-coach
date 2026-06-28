'use client'
import { useMemo } from 'react'
import { WriteList } from '@/components/WriteList'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

interface Props {
  items: PracticeItem[]
  enrichingIds?: Set<string>
  onDeleted: (ids: string[]) => void
}

export function VocabularyList({ items, enrichingIds, onDeleted }: Props) {
  const { t } = useTranslation()

  const { sessionGroups, manualItems } = useMemo(() => {
    const map = new Map<string, { title: string; items: PracticeItem[] }>()
    const manual: PracticeItem[] = []

    for (const item of items) {
      if (item.source === 'manual' || item.session_id === null) {
        manual.push(item)
        continue
      }
      const key = item.session_id
      const title = item.session_title ?? key
      if (!map.has(key)) map.set(key, { title, items: [] })
      map.get(key)!.items.push(item)
    }

    return { sessionGroups: Array.from(map.values()), manualItems: manual }
  }, [items])

  const isEmpty = sessionGroups.length === 0 && manualItems.length === 0

  if (isEmpty) {
    return <WriteList items={[]} onDeleted={onDeleted} />
  }

  return (
    <div className="space-y-10">
      {sessionGroups.map(group => (
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
      {manualItems.length > 0 && (
        <section key="__manual__">
          <h2 className="text-sm font-medium text-text-tertiary mb-3 tracking-wide uppercase">
            {t('vocabulary.fromRealLife')}
          </h2>
          <WriteList
            items={manualItems}
            enrichingIds={enrichingIds}
            onDeleted={onDeleted}
          />
        </section>
      )}
    </div>
  )
}
