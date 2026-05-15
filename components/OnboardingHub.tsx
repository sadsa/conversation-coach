// components/OnboardingHub.tsx
//
// First-run tutorial after the language pick. Replaces the old linear
// "upload illustration → share illustration" wizard with a single decisive
// screen offering both real input paths in parallel:
//
//   • Practice (primary) — links straight to /practice. The page itself owns
//     the explainer (mic permission, "5-minute session", review-after copy)
//     so we don't duplicate it here.
//   • Share from WhatsApp (secondary) — links to /onboarding?step=2, which
//     keeps the existing animated WhatsApp-share illustration as a single
//     deep-dive teaching frame.
//
// Why a hub instead of a numbered list — the .impeccable.md surface
// constraints explicitly call out the "1, 2, 3, 4 numbered cards" pattern
// as templated AI onboarding, and ask for one decisive action per surface.
// Two cards with deliberate visual weight (filled accent vs. neutral) is
// the closest honest answer for a product with two real input methods.
//
// Animation: cards stage in with the existing `stage-in` keyframe (cascade
// via inline animation-delay, motion-safe gated). Reduced-motion users get
// the rest state immediately.

'use client'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Wordmark } from '@/components/Wordmark'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'
import { buttonStyles } from '@/components/Button'

interface Props {
  /** Where the Share card routes — `?step=2` first run, `?step=2&revisit=true` from Settings. */
  shareHref: string
  /** Top-right exit callback. "Skip" on first run, "Close" when revisiting. */
  onExit: () => void
  exitLabel: string
}

const STAGE_IN = 'motion-safe:animate-[stage-in_360ms_cubic-bezier(0.16,1,0.3,1)_both]'

export function OnboardingHub({ shareHref, onExit, exitLabel }: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Top chrome — empty left column keeps the wordmark optically centred
          even though the hub has no Back. No progress dots: the hub is not
          a step in a sequence, it's the destination. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 flex-shrink-0">
        <div />
        <Wordmark />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onExit}
            className="text-sm text-text-tertiary hover:text-text-secondary transition-colors rounded-md px-1 -mr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {exitLabel}
          </button>
        </div>
      </div>

      {/* Body — heading + two cards. flex-1 lets the body absorb vertical
          slack on tall viewports without the cards stretching themselves. */}
      <div className="flex flex-1 flex-col gap-6 min-h-0">
        <h1 className={`font-display text-3xl font-medium text-text-primary leading-tight ${STAGE_IN}`}>
          {t('onboarding.hub.heading')}
        </h1>

        <div className="flex flex-col gap-3">
          {/* Practice — primary action. Soft accent tint mirrors the
              home-page Practice CTA so the user recognises the surface
              when they land on it next. */}
          <Link
            href="/practice?autostart=true"
            className={`group flex flex-col gap-3 rounded-2xl border border-accent-primary/30 bg-accent-primary/[0.05] p-5 transition-colors hover:bg-accent-primary/[0.09] hover:border-accent-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${STAGE_IN}`}
            style={{ animationDelay: '60ms' } as CSSProperties}
          >
            <div className="flex items-center gap-4">
              <span
                className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent-primary text-white flex items-center justify-center"
                aria-hidden="true"
              >
                <Icon name="message" className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-accent-primary">
                  {t('onboarding.hub.practice.eyebrow')}
                </p>
                <p className="font-display text-lg font-medium text-text-primary leading-snug">
                  {t('onboarding.hub.practice.title')}
                </p>
              </div>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              {t('onboarding.hub.practice.body')}
            </p>
            <span className={buttonStyles({ variant: 'primary', fullWidth: true, className: 'rounded-xl py-2.5 group-hover:bg-accent-primary-hover' })}>
              {t('onboarding.hub.practice.cta')} →
            </span>
          </Link>

          {/* Share — secondary, neutral surface. Stays a Link (no callback)
              so the route is the source of truth and back/forward work. */}
          <Link
            href={shareHref}
            className={`group flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-5 transition-colors hover:bg-surface-elevated hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${STAGE_IN}`}
            style={{ animationDelay: '140ms' } as CSSProperties}
          >
            <div className="flex items-center gap-4">
              <span
                className="flex-shrink-0 w-12 h-12 rounded-xl bg-surface-elevated text-text-secondary flex items-center justify-center"
                aria-hidden="true"
              >
                <ShareIcon />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                  {t('onboarding.hub.share.eyebrow')}
                </p>
                <p className="font-display text-lg font-medium text-text-primary leading-snug">
                  {t('onboarding.hub.share.title')}
                </p>
              </div>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              {t('onboarding.hub.share.body')}
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-primary group-hover:translate-x-0.5 transition-transform">
              {t('onboarding.hub.share.cta')}
              <span aria-hidden="true">→</span>
            </span>
          </Link>
        </div>

      </div>
    </div>
  )
}

// Inline share-arrow glyph — not in Icon.tsx because this is the only
// surface that needs it. Stroke-based to match the rest of the icon set.
function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}
