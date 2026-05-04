'use client'
import { useState, useEffect } from 'react'
import { WriteList } from '@/components/WriteList'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'
import { buildWriteContext } from '@/lib/voice-context'

interface Props {
  initialItems: PracticeItem[]
}

export function WriteClient({ initialItems }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>(initialItems)

  useEffect(() => {
    window.__ccVoiceContext = buildWriteContext(items) ?? undefined
    return () => { delete window.__ccVoiceContext }
  }, [items])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl md:text-4xl font-medium text-text-primary">
          {t('write.title')}
        </h1>
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
