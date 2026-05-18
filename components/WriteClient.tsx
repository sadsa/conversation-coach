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
// Header structure mirrors /review exactly: H1 in font-display →
// methodology eyebrow (Study active) → space-y-8 → list. The previous
// calm one-liner subtitle was dropped so the list starts at the same
// vertical position as the Review inbox; the same alignment is what
// makes the two pillars read as one brand. Empty-state copy already
// carries the "what lives here" framing, so nothing was lost.

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
      </header>
      <WriteList
        items={items}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
    </div>
  )
}
