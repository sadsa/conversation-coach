import type { JSX } from 'react'
import { parseFlashcard } from '@/lib/flashcard'

interface Props {
  /** Target-language sentence with one [[bracketed]] phrase. */
  flashcardBack: string
  /** Lower-contrast styling for the "Studied" archive view. */
  muted?: boolean
  /** Test hook on the wrapping element. */
  testId?: string
}

export function VocabularyRow({ flashcardBack, muted = false, testId }: Props): JSX.Element {
  const back = parseFlashcard(flashcardBack)

  // Match the review list-row treatment (see SessionList): Hanken Grotesk
  // (not the Source Serif display face), text-lg, balanced wrapping, and the
  // same non-bold body colour the review list uses for its rows
  // (text-secondary). Keeping the surrounding sentence at secondary lets it
  // recede as scaffolding so the corrected phrase — the only bold, tinted,
  // chip-free element — carries the emphasis and stays the high-contrast
  // focal point. The live (Due / To study) vs Studied distinction is then
  // carried by the phrase tint alone: correction-green when active, dropped
  // to a low-contrast secondary in the Studied archive.
  const backWrapper = 'text-text-secondary'
  const backBracket = muted
    ? 'text-text-secondary font-semibold'
    : 'text-correction font-semibold'

  return (
    <div data-testid={testId}>
      <p
        className={`text-lg text-balance ${backWrapper}`}
        data-testid={testId ? `${testId}-back` : undefined}
      >
        {back.before}
        {back.phrase !== '' && (
          <span className={backBracket}>{back.phrase}</span>
        )}
        {back.after}
      </p>
    </div>
  )
}
