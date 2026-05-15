'use client'
import { Suspense, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { OnboardingStep } from '@/components/OnboardingStep'
import { OnboardingHub } from '@/components/OnboardingHub'
import { WhatsAppShareIllustration } from '@/components/WhatsAppShareIllustration'
import { Wordmark } from '@/components/Wordmark'
import type { TargetLanguage } from '@/lib/types'

// URL semantics:
//   ?step=0          → language picker (one-time gate)
//   ?step=1          → hub (decisive choice between Practice and Share)
//   ?step=2          → WhatsApp share illustration (deep-dive opened FROM hub)
//
// step=1 used to be the upload-from-file tutorial; that input method is
// gone from the product, so the slot is now the hub. step=2 keeps its old
// behaviour and component so deep links from Settings (?step=2&revisit=true)
// still work.
const HUB_STEP = 1
const SHARE_STEP = 2

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
    router.push(`/onboarding?step=${HUB_STEP}`)
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

  // Exit copy (Skip first run, Close on revisit) is shared by hub and share.
  const exitKey = revisit ? 'onboarding.close' : 'onboarding.skip'
  // Out-of-range step values clamp into the [HUB_STEP, SHARE_STEP] range.
  // Anything < HUB_STEP that isn't 0 falls through to the hub; values >
  // SHARE_STEP land on the share screen.
  const tutorialStep = Math.min(SHARE_STEP, Math.max(HUB_STEP, step))

  // ── Step 1: hub ──────────────────────────────────────────────────────────────
  if (tutorialStep === HUB_STEP) {
    // Preserve revisit param when navigating to the share deep-dive so the
    // share screen knows it was opened from a Settings re-entry (which
    // changes the exit target to /settings, not /).
    const shareHref = revisit
      ? `/onboarding?step=${SHARE_STEP}&revisit=true`
      : `/onboarding?step=${SHARE_STEP}`
    return (
      <OnboardingShell>
        <div className="mx-auto h-full w-full max-w-sm">
          <OnboardingHub
            shareHref={shareHref}
            onExit={handleExit}
            exitLabel={t(exitKey)}
          />
        </div>
      </OnboardingShell>
    )
  }

  // ── Step 2: share illustration (deep-dive) ──────────────────────────────────
  // Reuses the wizard shell but with totalSteps=1 so the dot row hides
  // itself (one-of-one is meaningless). Back returns to the hub, preserving
  // revisit so re-entry from Settings keeps the close-target as /settings.
  function handleShareNext() {
    router.push(revisit ? '/settings' : '/')
  }

  function handleShareBack() {
    const params = revisit ? `?step=${HUB_STEP}&revisit=true` : `?step=${HUB_STEP}`
    router.push(`/onboarding${params}`)
  }

  const shareCtaKey = revisit ? 'onboarding.cta.done' : 'onboarding.cta.letsGo'

  return (
    <OnboardingShell>
      <div className="mx-auto h-full w-full max-w-sm">
        <OnboardingStep
          step={1}
          totalSteps={1}
          illustration={
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
          }
          heading={t('onboarding.share.heading')}
          body={t('onboarding.share.body')}
          ctaLabel={t(shareCtaKey)}
          onNext={handleShareNext}
          onBack={handleShareBack}
          backLabel={t('nav.back')}
          onExit={handleExit}
          exitLabel={t(exitKey)}
          stepOfTotalLabel={t('onboarding.stepOfTotal', { n: 1, total: 1 })}
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
