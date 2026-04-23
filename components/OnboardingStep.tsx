// components/OnboardingStep.tsx
//
// Shared shell for tutorial steps in the onboarding wizard.
// Pure display — no internal state. All content + navigation injected via props.
//
// Visual contract: a centred column with three distinct chrome rows above the
// content (back link / wordmark+dots / illustration) and the CTA + skip-or-close
// row below it. The progress dots animate via transform-only (impeccable motion
// rule), so layout never thrashes.

import type { ReactNode } from 'react'
import { Wordmark } from '@/components/Wordmark'

interface OnboardingStepProps {
  step: number
  totalSteps: number
  illustration: ReactNode
  heading: string
  body: string
  ctaLabel: string
  onNext: () => void
  /** Render a top-left "← Back" link. Omit on the first tutorial step. */
  onBack?: () => void
  backLabel?: string
  /** Render a top-right escape hatch (Skip on first run, Close on revisit). */
  onExit?: () => void
  exitLabel?: string
  stepOfTotalLabel: string
}

export function OnboardingStep({
  step,
  totalSteps,
  illustration,
  heading,
  body,
  ctaLabel,
  onNext,
  onBack,
  backLabel,
  onExit,
  exitLabel,
  stepOfTotalLabel,
}: OnboardingStepProps) {
  return (
    <div className="space-y-8">
      {/* Top chrome row: Back ← Wordmark → Exit. Three-column grid keeps the
          wordmark/dots column visually centred even when one side is empty. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <div className="flex justify-start">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors rounded-md px-1 -ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              ← {backLabel}
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <Wordmark />
          <div
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-label={stepOfTotalLabel}
            className="flex items-center gap-2"
          >
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map(i => {
              const active = i === step
              return (
                <span
                  key={i}
                  aria-hidden="true"
                  className={`block h-1.5 w-5 rounded-full origin-center transition-transform duration-200 ${
                    active
                      ? 'bg-accent-primary scale-x-100'
                      : 'bg-border scale-x-[0.3]'
                  }`}
                />
              )
            })}
          </div>
        </div>

        <div className="flex justify-end">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="text-sm text-text-tertiary hover:text-text-secondary transition-colors rounded-md px-1 -mr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {exitLabel}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-surface min-h-44 sm:min-h-52 flex items-center justify-center overflow-hidden py-6 sm:py-10">
        {illustration}
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{heading}</h1>
        <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full py-3 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {ctaLabel}
      </button>
    </div>
  )
}
