// components/LeitnerDashboard.tsx
'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem, BoxSummary } from '@/lib/types'

const LEITNER_INTERVAL_LABELS: Record<number, string> = {
  1: 'daily',
  2: '3 days',
  3: '1 week',
  4: '2 weeks',
  5: '4 weeks',
}

interface Props {
  boxes: BoxSummary[]
  cards: PracticeItem[]
  activeBox: number | null
}

export function LeitnerDashboard({ boxes, cards, activeBox }: Props) {
  const { t } = useTranslation()
  const [outcomes, setOutcomes] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleOutcome = useCallback((id: string, passed: boolean) => {
    setOutcomes(prev => ({ ...prev, [id]: passed }))
  }, [])

  async function handleConfirm() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const results = cards.map(card => ({
        id: card.id,
        passed: outcomes[card.id] ?? true,
      }))
      const res = await fetch('/api/practice-items/leitner-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ results }),
      })
      if (!res.ok) throw new Error('Failed to submit review')
      setSubmitted(true)
    } catch {
      setError('Could not save — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const nextDueBox = boxes.find(b => !b.due && b.count > 0)
  const nextDay = nextDueBox ? `pile ${nextDueBox.box}` : null

  if (submitted) {
    // Reload to show next due pile or caught-up state
    window.location.reload()
    return null
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Pile overview strip */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary mb-3">
          Your piles
        </p>
        <div className="flex gap-2">
          {boxes.map(box => (
            <div
              key={box.box}
              className={[
                'flex-1 rounded-xl border p-2.5 flex flex-col items-center gap-1',
                box.due
                  ? 'bg-chip-bg border-chip-border'
                  : 'bg-surface border-border-subtle',
              ].join(' ')}
            >
              <span className={`text-[10px] font-bold ${box.due ? 'text-chip-text' : 'text-text-tertiary'}`}>
                {box.box}
              </span>
              <span className={`text-base font-bold ${box.due ? 'text-text-primary' : 'text-text-tertiary'}`}>
                {box.count}
              </span>
              <span className="text-[9px] text-text-tertiary text-center leading-tight">
                {LEITNER_INTERVAL_LABELS[box.box]}
              </span>
              {box.due && (
                <span className="text-[9px] font-bold text-chip-text uppercase">due</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {activeBox !== null && cards.length > 0 ? (
        <>
          <div>
            <p className="text-sm font-semibold text-text-secondary mb-3">
              {t('flashcard.reviewPileHeading', { n: String(activeBox) })}
            </p>
            <div className="flex flex-col gap-2">
              {cards.map(card => {
                const outcome = outcomes[card.id]
                return (
                  <div
                    key={card.id}
                    className={[
                      'flex items-center gap-3 rounded-xl border p-3.5',
                      outcome === false
                        ? 'bg-error-container-bg border-error-bg opacity-60'
                        : outcome === true
                        ? 'bg-surface border-border-subtle opacity-50'
                        : 'bg-surface border-border-subtle',
                    ].join(' ')}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary leading-snug truncate">
                        {card.flashcard_front?.replace(/\[\[|\]\]/g, '') ?? card.original}
                      </p>
                      <p className="text-xs text-text-tertiary mt-0.5">{card.sub_category}</p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        aria-label="Wrong"
                        onClick={() => toggleOutcome(card.id, false)}
                        className={[
                          'w-9 h-9 rounded-full border flex items-center justify-center text-sm transition-colors',
                          outcomes[card.id] === false
                            ? 'bg-red-900/40 border-red-700 text-red-400'
                            : 'bg-transparent border-border text-text-tertiary hover:border-red-700 hover:text-red-400',
                        ].join(' ')}
                      >
                        ✕
                      </button>
                      <button
                        type="button"
                        aria-label="Correct"
                        onClick={() => toggleOutcome(card.id, true)}
                        className={[
                          'w-9 h-9 rounded-full border flex items-center justify-center text-sm transition-colors',
                          outcomes[card.id] === true
                            ? 'bg-green-900/40 border-green-700 text-correction'
                            : 'bg-transparent border-border text-text-tertiary hover:border-green-700 hover:text-correction',
                        ].join(' ')}
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full rounded-xl bg-chip-border py-3.5 text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
          >
            {submitting ? '…' : t('flashcard.confirmDone', { n: String(activeBox) })}
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-xl font-semibold text-text-primary">{t('flashcard.allCaughtUp')}</p>
          <p className="text-sm text-text-tertiary">{t('flashcard.allCaughtUpBody')}</p>
          {nextDay && (
            <p className="text-sm text-text-secondary">
              {t('flashcard.allCaughtUpNextDue', { n: String(nextDueBox?.box ?? ''), day: nextDay })}
            </p>
          )}
          <Link href="/" className="mt-2 text-sm text-chip-text underline">
            {t('flashcard.goHome')}
          </Link>
        </div>
      )}
    </div>
  )
}
