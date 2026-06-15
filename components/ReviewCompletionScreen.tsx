// components/ReviewCompletionScreen.tsx
//
// Shown in-place on /sessions/[id] after the user taps "Mark as reviewed".
// Two variants:
//  - phrasesSaved: list of corrections saved to Study, each with "Drill this phrase"
//  - nothingSaved: quiet acknowledgment + back to reviews
//
// Sits at the same DOM layer as the transcript it replaced — no route change,
// no modal, no push. Fades in via CSS transition in the parent.

'use client'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'
import { FlashcardRow } from '@/components/FlashcardRow'
import type { Annotation } from '@/lib/types'

export interface SavedPhrase {
  practiceItemId: string
  annotation: Annotation
}

interface Props {
  savedPhrases: SavedPhrase[]
  onDrillPhrase: (phrase: SavedPhrase) => void
}

export function ReviewCompletionScreen({ savedPhrases, onDrillPhrase }: Props) {
  const { t } = useTranslation()
  const count = savedPhrases.length

  return (
    <div className="space-y-10 motion-safe:animate-[stage-in_0.25s_ease-out_both]">
      {/* Header — quiet, not celebratory. `h1` so this state owns the page
          outline; the session title above is an inline edit control, not a
          heading. */}
      <header className="space-y-2">
        <h1 className="font-display text-2xl md:text-3xl tracking-[-0.015em] text-text-primary">
          {t('review.completion.title')}
        </h1>
        {count > 0 ? (
          <p className="text-base text-text-secondary leading-relaxed">
            {count === 1
              ? t('review.completion.phrasesSaved', { n: 1 })
              : t('review.completion.phrasesSaved_plural', { n: count })}
          </p>
        ) : (
          <p className="text-base text-text-secondary leading-relaxed">
            {t('review.completion.nothingSaved')}
          </p>
        )}
      </header>

      {/* Phrase list — only shown when something was saved. Each card IS the
          drill trigger: the whole surface is the primary next move after a
          review, so it carries real visual weight while the exit below stays
          quiet. */}
      {count > 0 && (
        <div className="space-y-3">
          {savedPhrases.map(phrase => (
            <PhraseCard
              key={phrase.practiceItemId}
              phrase={phrase}
              onDrill={() => onDrillPhrase(phrase)}
              drillLabel={t('review.completion.drillPhrase')}
            />
          ))}
        </div>
      )}

      {/* Footer navigation. When phrases were saved this is a quiet escape
          hatch — drilling is the loud move above. When nothing was saved it is
          the only action, so it earns accent weight. */}
      <div className="pt-2">
        <Link
          href="/review"
          className={
            count > 0
              ? 'inline-flex min-h-[2.75rem] items-center gap-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors'
              : 'inline-flex min-h-[2.75rem] items-center gap-2 text-base font-medium text-accent-primary hover:text-accent-primary-hover transition-colors'
          }
        >
          <Icon name="arrow-left" className="w-4 h-4" />
          {t('review.completion.backToReviews')}
        </Link>
      </div>
    </div>
  )
}

interface PhraseCardProps {
  phrase: SavedPhrase
  onDrill: () => void
  drillLabel: string
}

function PhraseCard({ phrase, onDrill, drillLabel }: PhraseCardProps) {
  const { annotation } = phrase
  const displayText = annotation.correction ?? annotation.original

  // Prefer the bilingual flashcard pair so the card reads exactly like a
  // Refine-queue row (native prompt + green-highlighted target). Older items
  // without flashcard fields fall back to the correction + explanation.
  const hasFlashcard =
    annotation.flashcard_front !== null && annotation.flashcard_back !== null

  // The entire card is the drill target — drilling is the primary move on this
  // screen, so the whole surface is tappable rather than a small text link.
  return (
    <button
      type="button"
      onClick={onDrill}
      aria-label={`${drillLabel}: ${displayText}`}
      className="group block w-full text-left rounded-xl bg-surface ring-1 ring-border-subtle p-4 space-y-3 transition-[box-shadow,background-color,transform] hover:ring-accent-primary/40 active:bg-accent-chip motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
    >
      {hasFlashcard ? (
        <FlashcardRow
          flashcardFront={annotation.flashcard_front!}
          flashcardBack={annotation.flashcard_back!}
        />
      ) : (
        <>
          {/* Correction text in display serif — same register as Study queue */}
          <p className="font-display text-lg md:text-xl leading-snug text-text-primary tracking-[-0.01em]">
            {displayText}
          </p>
          {annotation.explanation && (
            <p className="text-sm text-text-secondary leading-relaxed line-clamp-2">
              {annotation.explanation}
            </p>
          )}
        </>
      )}

      {/* Drill affordance — the loud cue. The whole card triggers it; this row
          names the action and nudges on hover. */}
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-primary">
        {drillLabel}
        <Icon
          name="arrow-right"
          className="w-3.5 h-3.5 transition-transform motion-safe:group-hover:translate-x-0.5"
        />
      </span>
    </button>
  )
}
