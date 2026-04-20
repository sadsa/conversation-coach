'use client'
import { useState } from 'react'
import { WriteList } from '@/components/WriteList'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

interface Props {
  initialItems: PracticeItem[]
}

export function WriteClient({ initialItems }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>(initialItems)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('write.title')}</h1>
        {items.length === 0 && (
          <p className="text-sm text-text-secondary mt-1">{t('write.subtitle')}</p>
        )}
      </div>
      <WriteList
        items={items}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
    </div>
  )
}
