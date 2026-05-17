'use client'
import { Suspense, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { OnboardingStep } from '@/components/OnboardingStep'
import { WhatsAppShareIllustration } from '@/components/WhatsAppShareIllustration'
import { Wordmark } from '@/components/Wordmark'
import { buttonStyles } from '@/components/Button'
import type { TargetLanguage } from '@/lib/types'

// URL semantics:
//   ?step=0 (or no step) → language picker (one-time gate)
//   ?step=2              → WhatsApp share illustration (deep-dive; opened
//                          from the home page Share CTA, or via deep link)
//
// The old ?step=1 "hub" was removed: after the user picks Practice vs.
// Share on the home page itself, the hub became a redundant relay screen.
// Any non-zero step value now routes to the share illustration so stale
// bookmarks (e.g. /onboarding?step=1) still land somewhere meaningful
// instead of 404-ing or quietly bouncing to /.
//
// `?revisit=true` is preserved for forward compatibility with any future
// Settings re-entry, but no in-app surface uses it today. Default exit
// from the share step goes back to / (no welcome flag — the welcome beat
// only fires after the language pick, the once-in-a-lifetime moment).

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
    // First-run completion lands on home with the peak-end beat — the
    // language pick is now the entire wizard, so this is the moment to fire
    // "all set." The hub used to sit between here and home; with that gone,
    // the user is one tap from the dashboard the moment they commit.
    router.push('/?welcome=true')
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
              centres) and lets the cards shrink rather than push the CTA
              off-screen on short ones. `min-h-0` is the flex-column escape
              hatch that lets children shrink below intrinsic content size. */}
          <div className="flex flex-1 flex-col justify-center gap-6 min-h-0">
            <div className="space-y-2 text-center">
              <h1 className="font-display text-3xl md:text-4xl font-medium text-text-primary">
                {t('onboarding.languageSelect.heading')}
              </h1>
              <p className="text-sm text-text-secondary leading-relaxed">
                {t('onboarding.languageSelect.body')}
              </p>
            </div>

            {/* Distilled from a settings-row radiogroup (right-side check
                dot, dense list) to two visually decisive cards. We keep the
                ARIA radiogroup semantics (correct for "select one, then
                confirm") and roving tabindex, but selection state lives on
                the card chrome itself — no separate dot, no metadata row.
                The big flag is the recognition cue; name + variant give the
                detail. CTA below stays as the explicit commit step because
                language is a profile-level choice, not a session toggle. */}
            <div
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
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
                  className={`flex flex-col items-center justify-center gap-3 px-5 py-6 rounded-2xl border-2 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    isSelected
                      ? 'border-accent-primary bg-accent-chip'
                      : 'border-transparent bg-surface hover:bg-surface-elevated'
                  }`}
                >
                  <span className="text-5xl leading-none">{opt.flag}</span>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-text-primary">{t(opt.nameKey)}</p>
                    <p className="text-xs text-text-tertiary">{t(opt.variantKey)}</p>
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
            className={buttonStyles({
              variant: 'primary',
              fullWidth: true,
              className: 'flex-shrink-0 rounded-xl py-3',
            })}
          >
            {t('onboarding.languageSelect.cta')}
          </button>
        </div>
      </OnboardingShell>
    )
  }

  // ── Share illustration (step ≠ 0) ────────────────────────────────────────────
  // Standalone surface now — the hub that used to wrap it is gone. The
  // user reaches this page from the home page Share CTA (or a stale deep
  // link from the removed Settings → Help → Share entry). No Back button
  // (there's nowhere to go back to within the wizard), no progress dots
  // (totalSteps=1).
  function handleShareExit() {
    // Revisit branch is kept for forward-compat with a possible future
    // Settings re-entry; no current surface sets it, so the practical
    // exit is always back to /. We deliberately do NOT fire the welcome
    // beat here — the user is learning a workflow mid-app, not
    // completing onboarding for the first time.
    router.push(revisit ? '/settings' : '/')
  }

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
              ariaLabel={t('onboarding.illus.shareAriaLabel')}
            />
          }
          heading={t('onboarding.share.heading')}
          body={t('onboarding.share.body')}
          ctaLabel={t('onboarding.cta.done')}
          onNext={handleShareExit}
          onExit={handleShareExit}
          exitLabel={t('onboarding.close')}
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
//
// No extra "warmth" overlay on the shell. The `bg-bg` token is already
// warm cream (oklch(97.5% 0.008 75) in light mode — hue 75 is the warm
// yellow-cream zone), and adding a peach/amber gradient over it would
// introduce an off-palette hue. The brand accent is cool purple (hue 285);
// warmth in this product comes from the cream substrate showing through
// low-opacity cool tints, not from a competing warm hue.
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
