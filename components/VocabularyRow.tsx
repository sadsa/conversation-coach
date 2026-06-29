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

  const backWrapper = muted ? 'text-text-secondary' : 'text-text-primary'
  const backBracket = muted
    ? 'text-text-secondary font-semibold'
    : 'text-correction font-semibold bg-widget-write-bg/60'

  return (
    <div data-testid={testId}>
      <p
        className={`font-display text-base md:text-lg leading-snug tracking-[-0.005em] ${backWrapper}`}
        data-testid={testId ? `${testId}-back` : undefined}
      >
        {back.before}
        {back.phrase !== '' && (
          <span className={`${backBracket} rounded px-1.5 -mx-0.5 box-decoration-clone`}>
            {back.phrase}
          </span>
        )}
        {back.after}
      </p>
    </div>
  )
}
