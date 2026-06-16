'use client'
import { useState } from 'react'
import { VocabularyList } from '@/components/VocabularyList'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

interface Props {
  initialItems: PracticeItem[]
}

export function VocabularyClient({ initialItems }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>(initialItems)

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-page-title">
          {t('write.title')}
        </h1>
      </header>
      <VocabularyList
        items={items}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
    </div>
  )
}
