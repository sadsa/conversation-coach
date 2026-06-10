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
// When the user taps "Practise this phrase" in WriteSheet, LessonClient
// mounts in-place (same pattern as PracticeClient on the home surface).
// onExit unmounts LessonClient and returns to the study list.

'use client'
import { useState } from 'react'
import { WriteList } from '@/components/WriteList'
import { LessonClient } from '@/components/LessonClient'
import { MethodologyEyebrow, type Pillar } from '@/components/MethodologyEyebrow'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

interface Props {
  initialItems: PracticeItem[]
  /**
   * Locked-pillar passthrough — see ReviewClient for the full rationale.
   * The only entry that can land here today is `'review'` (no sessions
   * yet), since Study is the active surface. Optional for test parity.
   */
  lockedPillars?: ReadonlyArray<Pillar>
}

export function WriteClient({ initialItems, lockedPillars }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>(initialItems)
  const [lessonItem, setLessonItem] = useState<PracticeItem | null>(null)

  if (lessonItem) {
    return (
      <LessonClient
        phrase={{
          correction: lessonItem.correction ?? lessonItem.original,
          explanation: lessonItem.explanation,
          flashcard_front: lessonItem.flashcard_front,
          flashcard_back: lessonItem.flashcard_back,
          practice_item_id: lessonItem.id,
        }}
        onExit={() => setLessonItem(null)}
        onStudied={(id) => {
          setItems(prev => prev.map(i => i.id === id ? { ...i, written_down: true } : i))
          setLessonItem(null)
        }}
      />
    )
  }

  return (
    // Page rhythm matches /, /review, /settings: space-y-8 between
    // header and content section, same as the other three tabs.
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-page-title">
          {t('write.title')}
        </h1>
        <MethodologyEyebrow active="study" lockedPillars={lockedPillars} />
      </header>
      <WriteList
        items={items}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
        onPractise={setLessonItem}
      />
    </div>
  )
}
