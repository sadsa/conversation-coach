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
      {/* Header — quiet, not celebratory */}
      <header className="space-y-2">
        <h2 className="font-display text-2xl md:text-3xl tracking-[-0.015em] text-text-primary">
          {t('review.completion.title')}
        </h2>
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

      {/* Phrase list — only shown when something was saved */}
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

      {/* Footer navigation */}
      <div className="pt-2">
        <Link
          href="/review"
          className="inline-flex items-center gap-2 text-sm text-accent-primary hover:text-accent-primary-hover transition-colors"
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

  return (
    <div className="rounded-xl bg-surface-elevated ring-1 ring-border-subtle p-4 space-y-3">
      {/* The correction text in display serif — same register as Study queue */}
      <p className="font-display text-lg md:text-xl leading-snug text-text-primary tracking-[-0.01em]">
        {displayText}
      </p>

      {/* Brief explanation in small body */}
      {annotation.explanation && (
        <p className="text-sm text-text-secondary leading-relaxed line-clamp-2">
          {annotation.explanation}
        </p>
      )}

      {/* Drill CTA — secondary weight, not the primary action */}
      <button
        type="button"
        onClick={onDrill}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-primary hover:text-accent-primary-hover transition-colors"
      >
        {drillLabel}
        <Icon name="arrow-right" className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
