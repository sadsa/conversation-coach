// components/OnboardingStep.tsx
//
// Shared shell for tutorial steps 1–3 in the onboarding wizard.
// Pure display — no internal state. All content injected via props.

import type { ReactNode } from 'react'

interface OnboardingStepProps {
  step: 1 | 2 | 3
  illustration: ReactNode
  heading: string
  body: string
  ctaLabel: string
  onNext: () => void
}

export function OnboardingStep({
  step,
  illustration,
  heading,
  body,
  ctaLabel,
  onNext,
}: OnboardingStepProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">
          Conversation Coach
        </p>
        <div
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-label={`Step ${step} of 3`}
          className="flex justify-center gap-2"
        >
          {([1, 2, 3] as const).map(i => (
            <div
              key={i}
              className={
                i === step
                  ? 'h-1.5 w-5 rounded-full bg-accent-primary transition-all'
                  : 'h-1.5 w-1.5 rounded-full bg-border transition-all'
              }
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-surface h-44 flex items-center justify-center overflow-hidden">
        {illustration}
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{heading}</h1>
        <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full py-3 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-semibold text-sm transition-colors"
      >
        {ctaLabel}
      </button>
    </div>
  )
}
