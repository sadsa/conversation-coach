'use client'
import { Suspense, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { OnboardingStep } from '@/components/OnboardingStep'
import { UploadIllustration } from '@/components/UploadIllustration'
import { WhatsAppShareIllustration } from '@/components/WhatsAppShareIllustration'
import { Wordmark } from '@/components/Wordmark'
import type { TargetLanguage } from '@/lib/types'

const TOTAL_TUTORIAL_STEPS = 2
const FIRST_TUTORIAL_STEP = 1

interface LanguageOption {
  value: TargetLanguage
  nameKey: string
  variantKey: string
  flag: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  {
    value: 'es-AR',
    nameKey: 'onboarding.languageSelect.spanish',
    variantKey: 'onboarding.languageSelect.spanishVariant',
    flag: '🇦🇷',
  },
  {
    value: 'en-NZ',
    nameKey: 'onboarding.languageSelect.english',
    variantKey: 'onboarding.languageSelect.englishVariant',
    flag: '🇳🇿',
  },
]

// ─── Step content map ─────────────────────────────────────────────────────────
// Illustrations live in their own components (see components/UploadIllustration
// and components/WhatsAppShareIllustration). Labels go through t() so a
// Spanish-speaking learner doesn't see English chrome inside an otherwise-
// Spanish tutorial.

type TutorialStep = 1 | 2

interface StepConfig {
  illustration: (t: (key: string) => string) => ReactNode
  headingKey: string
  bodyKey: string
}

const STEP_CONFIG: Record<TutorialStep, StepConfig> = {
  1: {
    illustration: t => (
      <UploadIllustration
        uploadLabel={t('onboarding.illus.uploadButton')}
        pickerTitle={t('onboarding.illus.pickerTitle')}
        appLabel={t('onboarding.illus.appCoach')}
      />
    ),
    headingKey: 'onboarding.upload.heading',
    bodyKey: 'onboarding.upload.body',
  },
  2: {
    illustration: t => (
      <WhatsAppShareIllustration
        shareTitle={t('onboarding.illus.shareTitle')}
        contactName={t('onboarding.illus.shareContact')}
        appLabels={{
          messages: t('onboarding.illus.appMessages'),
          mail: t('onboarding.illus.appMail'),
          coach: t('onboarding.illus.appCoach'),
          files: t('onboarding.illus.appFiles'),
        }}
      />
    ),
    headingKey: 'onboarding.share.heading',
    bodyKey: 'onboarding.share.body',
  },
}

// ─── Main content (needs Suspense for useSearchParams) ────────────────────────

function OnboardingContent() {
  const [selected, setSelected] = useState<TargetLanguage | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, setTargetLanguage } = useTranslation()
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([])

  const stepParam = searchParams.get('step')
  const revisit = searchParams.get('revisit') === 'true'
  const parsed = stepParam ? parseInt(stepParam, 10) : 0
  const step = isNaN(parsed) ? 0 : Math.max(0, parsed)

  function handleLanguageConfirm() {
    if (!selected) return
    setTargetLanguage(selected)
    router.push(`/onboarding?step=${FIRST_TUTORIAL_STEP}`)
  }

  function gotoStep(n: number) {
    const params = revisit ? `?step=${n}&revisit=true` : `?step=${n}`
    router.push(`/onboarding${params}`)
  }

  function handleNext(currentStep: TutorialStep) {
    if (currentStep < TOTAL_TUTORIAL_STEPS) {
      gotoStep(currentStep + 1)
    } else {
      router.push(revisit ? '/settings' : '/')
    }
  }

  function handleBack(currentStep: TutorialStep) {
    if (currentStep > FIRST_TUTORIAL_STEP) gotoStep(currentStep - 1)
  }

  function handleExit() {
    router.push(revisit ? '/settings' : '/')
  }

  // Radiogroup keyboard nav: Arrow keys move focus AND selection between
  // the language options, matching the WAI-ARIA radiogroup pattern.
  function handleRadioKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    const last = LANGUAGE_OPTIONS.length - 1
    let nextIdx: number | null = null
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        nextIdx = idx === last ? 0 : idx + 1
        break
      case 'ArrowUp':
      case 'ArrowLeft':
        nextIdx = idx === 0 ? last : idx - 1
        break
      case 'Home':
        nextIdx = 0
        break
      case 'End':
        nextIdx = last
        break
    }
    if (nextIdx !== null) {
      e.preventDefault()
      setSelected(LANGUAGE_OPTIONS[nextIdx].value)
      radioRefs.current[nextIdx]?.focus()
    }
  }

  // ── Step 0: language select ──────────────────────────────────────────────────
  if (step === 0) {
    return (
      // Full-viewport shell — see the comment block above the tutorial-step
      // shell below for why we own the viewport with `fixed inset-0` instead
      // of relying on the layout's `<main>` chrome.
      <OnboardingShell>
        <div className="mx-auto flex h-full w-full max-w-sm flex-col gap-8">
          <Wordmark className="text-center flex-shrink-0" />

          {/* Middle band absorbs vertical slack on tall viewports (content
              centres) and lets the radio list shrink rather than push the
              CTA off-screen on short ones. `min-h-0` is the well-known
              flex-column escape hatch that lets children shrink below their
              intrinsic content size. */}
          <div className="flex flex-1 flex-col justify-center gap-6 min-h-0">
            <div className="space-y-2 text-center">
              <h1 className="font-display text-3xl font-medium text-text-primary">
                {t('onboarding.languageSelect.heading')}
              </h1>
              <p className="text-sm text-text-secondary">
                {t('onboarding.languageSelect.body')}
              </p>
            </div>

            <div
              className="space-y-3"
              role="radiogroup"
              aria-label={t('onboarding.languageSelect.targetLanguageAria')}
            >
            {LANGUAGE_OPTIONS.map((opt, idx) => {
              const isSelected = selected === opt.value
              // Roving tabindex: only the selected (or first if none) is in tab order.
              const isTabStop = isSelected || (selected === null && idx === 0)
              return (
                <button
                  key={opt.value}
                  ref={el => {
                    radioRefs.current[idx] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isTabStop ? 0 : -1}
                  onClick={() => setSelected(opt.value)}
                  onKeyDown={e => handleRadioKeyDown(e, idx)}
                  className={`w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    isSelected
                      ? 'border-accent-primary bg-accent-chip'
                      : 'border-border bg-surface hover:border-accent-primary/40 hover:bg-surface-elevated'
                  }`}
                >
                  <span className="text-4xl leading-none flex-shrink-0">{opt.flag}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-text-primary">{t(opt.nameKey)}</p>
                    <p className="text-sm text-text-tertiary mt-0.5">{t(opt.variantKey)}</p>
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
          </div>

          <button
            type="button"
            onClick={handleLanguageConfirm}
            disabled={selected === null}
            className="w-full flex-shrink-0 py-3 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t('onboarding.languageSelect.cta')}
          </button>
        </div>
      </OnboardingShell>
    )
  }

  // ── Tutorial steps (clamped into the configured range) ──────────────────────
  const tutorialStep = Math.min(TOTAL_TUTORIAL_STEPS, Math.max(FIRST_TUTORIAL_STEP, step)) as TutorialStep
  const config = STEP_CONFIG[tutorialStep]
  const isLastStep = tutorialStep === TOTAL_TUTORIAL_STEPS
  const ctaKey = !isLastStep
    ? 'onboarding.cta.next'
    : revisit
    ? 'onboarding.cta.done'
    : 'onboarding.cta.letsGo'

  // Back is only meaningful between tutorial steps. We deliberately do NOT
  // route back to step 0 (the language picker) — once chosen, language change
  // belongs in Settings, not in the wizard.
  const showBack = tutorialStep > FIRST_TUTORIAL_STEP
  // Exit (Skip / Close) gives every step an in-app way out so the user is never
  // forced to march to the end. Skip on first run, Close on revisit.
  const exitKey = revisit ? 'onboarding.close' : 'onboarding.skip'

  return (
    <OnboardingShell>
      <div className="mx-auto h-full w-full max-w-sm">
        <OnboardingStep
          step={tutorialStep}
          totalSteps={TOTAL_TUTORIAL_STEPS}
          illustration={config.illustration(t)}
          heading={t(config.headingKey)}
          body={t(config.bodyKey)}
          ctaLabel={t(ctaKey)}
          onNext={() => handleNext(tutorialStep)}
          onBack={showBack ? () => handleBack(tutorialStep) : undefined}
          backLabel={showBack ? t('nav.back') : undefined}
          onExit={handleExit}
          exitLabel={t(exitKey)}
          stepOfTotalLabel={t('onboarding.stepOfTotal', {
            n: tutorialStep,
            total: TOTAL_TUTORIAL_STEPS,
          })}
        />
      </div>
    </OnboardingShell>
  )
}

// Full-viewport shell shared by both onboarding branches.
//
// Why `position: fixed inset-0` instead of just `min-h-[100dvh]`?
//   • The root layout's `<main>` element wraps every route in `pt-8 pb-20`
//     plus a `marginTop` of `var(--header-height) + safe-area-inset-top`,
//     which together steal ~180px of vertical space. ConditionalNav already
//     hides the AppHeader on `/onboarding`, but the `<main>` chrome stays —
//     so without escaping the layout flow, the wizard always overflows on
//     phones.
//   • `100vh` is famously broken on mobile Safari (it equals the viewport
//     height with the URL bar collapsed, so content scrolls when the URL
//     bar is visible). `position: fixed inset-0` is anchored to the layout
//     viewport, which IS the visible rect — same robustness as `100dvh`
//     without needing to special-case browsers that lack `dvh` support.
//   • Safe-area padding via `env(safe-area-inset-*)` slots the wizard
//     between the iOS status bar and home indicator on PWA installs;
//     `viewport-fit: cover` is already set globally, so these resolve to
//     real values.
function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-bg"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
      }}
    >
      {children}
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
