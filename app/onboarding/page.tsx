'use client'
import { Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { OnboardingStep } from '@/components/OnboardingStep'
import type { TargetLanguage } from '@/lib/types'

const LANGUAGE_OPTIONS: { value: TargetLanguage; name: string; variant: string; flag: string }[] = [
  { value: 'es-AR', name: 'Spanish', variant: 'Rioplatense · Argentine', flag: '🇦🇷' },
  { value: 'en-NZ', name: 'English', variant: 'New Zealand English', flag: '🇳🇿' },
]

// ─── Step illustrations ────────────────────────────────────────────────────────

function Step1Illustration() {
  const items = [
    { icon: '🎙️', label: 'Record' },
    { icon: '📤', label: 'Upload' },
    { icon: '✏️', label: 'Review' },
    { icon: '📝', label: 'Write' },
  ]
  return (
    <div className="flex items-center gap-1 px-3 w-full" aria-hidden="true">
      {items.flatMap((item, i, arr) => {
        const node = (
          <div key={item.label} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-accent-chip flex items-center justify-center text-xl leading-none">
              {item.icon}
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary text-center w-full truncate">
              {item.label}
            </span>
          </div>
        )
        return i < arr.length - 1
          ? [node, <span key={`a${i}`} className="text-text-tertiary text-xs flex-shrink-0 mb-3">›</span>]
          : [node]
      })}
    </div>
  )
}

function Step2Illustration() {
  return (
    <div className="flex flex-col items-center gap-3" aria-hidden="true">
      <div className="flex items-center gap-2 bg-accent-primary text-white rounded-full py-3 px-5 shadow-lg">
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span className="text-sm font-semibold">Upload audio</span>
      </div>
      <div className="flex gap-1.5">
        {['.mp3', '.m4a', '.wav', '.opus'].map(ext => (
          <span
            key={ext}
            className="text-xs font-semibold px-2 py-1 rounded-md bg-surface-elevated text-text-tertiary"
          >
            {ext}
          </span>
        ))}
      </div>
    </div>
  )
}

function Step3Illustration() {
  const apps = [
    { label: 'Messages', content: <span>💬</span>, highlight: false },
    { label: 'Mail', content: <span>📧</span>, highlight: false },
    { label: 'Coach', content: <span className="text-white text-xs font-bold">CC</span>, highlight: true },
    { label: 'Files', content: <span>📁</span>, highlight: false },
  ]
  return (
    <div className="flex items-center justify-center w-full" aria-hidden="true">
      <div className="w-60 bg-surface rounded-2xl shadow-lg overflow-hidden border border-border-subtle">
        <div className="bg-surface-elevated px-3 py-2.5 border-b border-border-subtle text-center text-xs text-text-tertiary font-medium">
          Share voice note via…
        </div>
        <div className="flex items-start justify-around px-2 py-3">
          {apps.map(app => (
            <div
              key={app.label}
              className={`flex flex-col items-center gap-1.5 ${app.highlight ? '' : 'opacity-40'}`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                  app.highlight ? 'bg-accent-primary shadow-md' : 'bg-surface-elevated'
                }`}
              >
                {app.content}
              </div>
              <span
                className={`text-[10px] font-medium text-center ${
                  app.highlight ? 'text-accent-primary font-semibold' : 'text-text-tertiary'
                }`}
              >
                {app.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Step content map ─────────────────────────────────────────────────────────

type TutorialStep = 1 | 2 | 3

interface StepConfig {
  illustration: ReactNode
  headingKey: string
  bodyKey: string
}

const STEP_CONFIG: Record<TutorialStep, StepConfig> = {
  1: {
    illustration: <Step1Illustration />,
    headingKey: 'onboarding.step1.heading',
    bodyKey: 'onboarding.step1.body',
  },
  2: {
    illustration: <Step2Illustration />,
    headingKey: 'onboarding.step2.heading',
    bodyKey: 'onboarding.step2.body',
  },
  3: {
    illustration: <Step3Illustration />,
    headingKey: 'onboarding.step3.heading',
    bodyKey: 'onboarding.step3.body',
  },
}

// ─── Main content (needs Suspense for useSearchParams) ────────────────────────

function OnboardingContent() {
  const [selected, setSelected] = useState<TargetLanguage | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, setTargetLanguage } = useTranslation()

  const stepParam = searchParams.get('step')
  const revisit = searchParams.get('revisit') === 'true'
  const step = stepParam ? Math.max(0, parseInt(stepParam, 10)) : 0

  function handleLanguageConfirm() {
    if (!selected) return
    setTargetLanguage(selected)
    router.push('/onboarding?step=1')
  }

  function handleNext(currentStep: TutorialStep) {
    if (currentStep < 3) {
      const next = currentStep + 1
      const params = revisit ? `?step=${next}&revisit=true` : `?step=${next}`
      router.push(`/onboarding${params}`)
    } else {
      router.push(revisit ? '/settings' : '/')
    }
  }

  // ── Step 0: language select ──────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-7rem)] px-6">
        <div className="w-full max-w-sm space-y-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary text-center">
            Conversation Coach
          </p>

          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              What are you learning?
            </h1>
            <p className="text-sm text-text-secondary">
              Pick the language you want to practise. You can change this later in Settings.
            </p>
          </div>

          <div className="space-y-3" role="radiogroup" aria-label="Target language">
            {LANGUAGE_OPTIONS.map(opt => {
              const isSelected = selected === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelected(opt.value)}
                  className={`w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-colors ${
                    isSelected
                      ? 'border-accent-primary bg-accent-chip'
                      : 'border-border bg-surface hover:border-accent-primary/40 hover:bg-surface-elevated'
                  }`}
                >
                  <span className="text-4xl leading-none flex-shrink-0">{opt.flag}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-text-primary">{opt.name}</p>
                    <p className="text-sm text-text-tertiary mt-0.5">{opt.variant}</p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? 'bg-accent-primary border-accent-primary' : 'border-border'
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handleLanguageConfirm}
            disabled={selected === null}
            className="w-full py-3 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Get started →
          </button>
        </div>
      </div>
    )
  }

  // ── Steps 1–3: tutorial ──────────────────────────────────────────────────────
  const tutorialStep = Math.min(3, step) as TutorialStep
  const config = STEP_CONFIG[tutorialStep]
  const ctaKey =
    tutorialStep < 3
      ? 'onboarding.cta.next'
      : revisit
      ? 'onboarding.cta.done'
      : 'onboarding.cta.letsGo'

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-7rem)] px-6">
      <div className="w-full max-w-sm">
        <OnboardingStep
          step={tutorialStep}
          illustration={config.illustration}
          heading={t(config.headingKey)}
          body={t(config.bodyKey)}
          ctaLabel={t(ctaKey)}
          onNext={() => handleNext(tutorialStep)}
        />
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  )
}
