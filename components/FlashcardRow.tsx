// components/FlashcardRow.tsx
//
// Concept-A row body for the Study list. Renders the bilingual phrase
// pair Claude already produces on each annotation (and which we mirror
// onto `practice_items`):
//
//   flashcard_front  — sentence in the user's NATIVE language with the
//                      correct equivalent phrase wrapped in [[brackets]].
//                      For a Spanish learner: English. For an English
//                      learner: Spanish.
//   flashcard_back   — sentence in the user's TARGET language with the
//                      corrected phrase wrapped in [[brackets]].
//
// Layout intent ("native prompt, target answer", per
// mockups/study-card-redesign.html):
//
//   ┌────────────────────────────────────────────────┐
//   │  I [went] to the market yesterday.             │  ← italic, tertiary
//   │  ╔════╗                                        │
//   │  ║ Fui ║ al mercado ayer.                      │  ← serif, primary
//   │  ╚════╝                                        │     bracket in green
//   └────────────────────────────────────────────────┘
//
// The rule "target sits on the bottom line" is intentional and language-
// agnostic — `flashcard_front` is always the meaning the user reads to
// orient, `flashcard_back` is always the phrase they're learning. The
// component never needs to know which language it's actually rendering.
//
// Sheet body keeps using <CorrectionInContext> — the original-sentence
// strike-through treatment earns its space when the user has tapped in
// for the full story. The row is for recall; the sheet is for context.

import type { JSX } from 'react'
import { parseFlashcard } from '@/lib/flashcard'

interface Props {
  /** Native-language sentence with one [[bracketed]] phrase. */
  flashcardFront: string
  /** Target-language sentence with one [[bracketed]] phrase. */
  flashcardBack: string
  /** Lower-contrast styling for the "Written" archive view. */
  muted?: boolean
  /** Test hook on the wrapping element (mirrors CorrectionInContext). */
  testId?: string
}

export function FlashcardRow({
  flashcardFront,
  flashcardBack,
  muted = false,
  testId,
}: Props): JSX.Element {
  const front = parseFlashcard(flashcardFront)
  const back = parseFlashcard(flashcardBack)

  // Native row — italic, smaller, tertiary by default. The bracketed
  // phrase is the meaning hook so we lift it one tone (secondary) and
  // drop the italic so the eye snaps to it before drifting outward.
  // Muted (Written archive) drops both lines another step.
  const frontWrapper = muted
    ? 'text-text-tertiary/70'
    : 'text-text-tertiary'
  const frontBracket = muted
    ? 'not-italic text-text-tertiary'
    : 'not-italic text-text-secondary'

  // Target row — Source Serif 4 medium, primary, slightly larger. The
  // bracketed phrase gets the brand correction-green text and a soft
  // tinted fill so it reads as the row's anchor at scan distance.
  const backWrapper = muted
    ? 'text-text-secondary'
    : 'text-text-primary'
  const backBracket = muted
    ? 'text-text-secondary font-semibold'
    : 'text-correction font-semibold bg-widget-write-bg/60'

  return (
    <div data-testid={testId} className="space-y-1">
      <p
        className={`text-sm leading-snug italic ${frontWrapper}`}
        data-testid={testId ? `${testId}-front` : undefined}
      >
        {front.before}
        {front.phrase !== '' && (
          <span className={frontBracket}>{front.phrase}</span>
        )}
        {front.after}
      </p>
      <p
        className={`font-display text-base md:text-lg leading-snug tracking-[-0.005em] ${backWrapper}`}
        data-testid={testId ? `${testId}-back` : undefined}
      >
        {back.before}
        {back.phrase !== '' && (
          <span
            className={
              back.phrase !== ''
                ? `${backBracket} rounded px-1.5 -mx-0.5 box-decoration-clone`
                : ''
            }
          >
            {back.phrase}
          </span>
        )}
        {back.after}
      </p>
    </div>
  )
}
