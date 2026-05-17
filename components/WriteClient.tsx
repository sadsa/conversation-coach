// components/WriteClient.tsx
//
// Client island for /write — the Study queue surface.
//
// The URL stays /write for stability (CLAUDE.md gotcha — bookmarks,
// deep links, the API path `/api/practice-items`), but the visible
// surface name now reads as "Study" to match the methodology pillar
// the home redesign established. Internal verbs ("Mark as written",
// the Written archive) keep using "write" because that's the literal
// physical action.
//
// Header structure mirrors the home: H1 in font-display → methodology
// eyebrow (Study active) → calm one-line subtitle. The eyebrow is the
// thread that ties Practise / Review / Study together visually across
// all three surfaces; without it the user can land here from a deep
// link and lose the three-pillar mental model the home introduced.

'use client'
import { useState } from 'react'
import { WriteList } from '@/components/WriteList'
import { MethodologyEyebrow } from '@/components/MethodologyEyebrow'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

interface Props {
  initialItems: PracticeItem[]
}

export function WriteClient({ initialItems }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>(initialItems)

  return (
    // Page rhythm matches /, /review, /settings: space-y-8 between
    // header and content section, same as the other three tabs.
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl md:text-4xl font-medium text-text-primary">
          {t('write.title')}
        </h1>
        <MethodologyEyebrow active="study" />
        <p className="text-text-secondary leading-relaxed pt-1">
          {t('write.subtitle')}
        </p>
      </header>
      <WriteList
        items={items}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
    </div>
  )
}
