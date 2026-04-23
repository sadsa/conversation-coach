// components/OnboardingStep.tsx
//
// Shared shell for tutorial steps in the onboarding wizard.
// Pure display — no internal state. All content + navigation injected via props.
//
// Visual contract: a flex column that fills the available height of its
// parent (the OnboardingShell in app/onboarding/page.tsx owns the viewport).
// Three vertical regions:
//   1. Top chrome (Back / Wordmark + dots / Exit) — flex-shrink-0
//   2. Middle (illustration + heading + body) — flex-1, content centred
//      vertically so it floats nicely on tall screens and presses up
//      against the chrome on short ones without overflow
//   3. CTA — flex-shrink-0, pinned to the bottom
//
// Critical bit: the middle region uses `min-h-0` so it can actually shrink
// below its intrinsic content size. Without it, the illustration would
// push the CTA off-screen on small viewports — the bug this layout was
// rewritten to fix.
//
// The progress dots still animate via transform-only (impeccable motion
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
    <div className="flex h-full flex-col gap-6">
      {/* Top chrome row: Back ← Wordmark → Exit. Three-column grid keeps the
          wordmark/dots column visually centred even when one side is empty. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 flex-shrink-0">
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

      {/* Middle band: absorbs vertical slack on tall viewports (the
          illustration + copy float toward centre) and lets the illustration
          card hug its content tightly on short ones. The illustrations
          themselves are fixed-size visual assets (264×184), so the card no
          longer needs a min-height — it sizes to the asset plus a small
          inset, freeing ~80px of vertical space we used to waste. */}
      <div className="flex flex-1 flex-col justify-center gap-6 min-h-0">
        <div className="rounded-2xl bg-surface flex items-center justify-center overflow-hidden p-4 sm:p-6">
          {illustration}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{heading}</h1>
          <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full flex-shrink-0 py-3 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {ctaLabel}
      </button>
    </div>
  )
}
