// components/LessonPhrasePill.tsx
//
// Anchored phrase display shown below the phase rail throughout a lesson.
// Eyebrow "Studying" + correction in Source Serif 4 with the [[bracketed]]
// phrase tinted in --color-correction-text.

import { parseFlashcard } from '@/lib/flashcard'

interface Props {
  /** The corrected phrase, e.g. "Fui al mercado ayer". */
  correction: string
  /**
   * Optional flashcard_front with [[double-bracket]] phrase marker,
   * e.g. "Me [[fui]] al mercado ayer".
   * When present, the bracketed segment is tinted on the correction line.
   */
  flashcard_front: string | null
}

export function LessonPhrasePill({ correction, flashcard_front }: Props) {
  const parsed = flashcard_front ? parseFlashcard(flashcard_front) : null
  const hasPhrase = parsed && parsed.phrase

  return (
    <div className="mx-4 mt-3 px-3 py-2.5 bg-surface border border-border-subtle rounded-[10px] flex-shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary mb-1">
        Studying
      </p>
      <p className="font-display text-[15px] text-text-primary leading-snug">
        {hasPhrase ? (
          <>
            {parsed.before}
            <em className="text-correction not-italic">{parsed.phrase}</em>
            {parsed.after}
          </>
        ) : (
          correction
        )}
      </p>
    </div>
  )
}
