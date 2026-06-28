'use client'
import { useState } from 'react'
import { VocabularyList } from '@/components/VocabularyList'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

interface Props {
  initialItems: PracticeItem[]
  dueCount: number
}

export function VocabularyClient({ initialItems, dueCount }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>(initialItems)

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-page-title">
          {t('vocabulary.title')}
        </h1>
        {dueCount > 0 && (
          <p className="inline-block rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
            {t('vocabulary.dueCount', { n: dueCount })}
          </p>
        )}
      </header>
      <VocabularyList
        items={items}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
    </div>
  )
}
