// components/OnboardingHub.tsx
//
// First-run tutorial after the language pick. Replaces the old two-card
// "Practice vs. Share" hub with a single-action surface that hands the user
// straight to the practice mode picker, with the WhatsApp-share deep-dive
// demoted to a quiet footer link.
//
// Why the demotion:
//   1. Most users who arrive via WhatsApp share intent never see this hub —
//      they're routed through the service worker → IndexedDB → HomeClient
//      upload flow and land on /sessions/[id]/status directly. The hub's
//      audience is users who opened the app deliberately; for them Practice
//      is the headline experience.
//   2. The previous two-card mirror-image scaffold (eyebrow + 48px icon tile
//      + title + body + CTA, ×2) read as templated AI onboarding. Even with
//      one card tinted accent and one neutral, the underlying structure was
//      indistinguishable from a thousand other onboarding screens.
//   3. The .impeccable.md brand voice is "patient, encouraging, spacious."
//      A single inviting card with breathing room around it lands warmer
//      than a balanced choice the user didn't ask for.
//
// Layout: top chrome (empty / wordmark / exit), then a warm-tinted Practice
// card that owns the visual centre, then a small text link below for the
// fallback share-from-WhatsApp path. No icon tile, no uppercase eyebrow.
//
// Animation: card stages in with the existing `stage-in` keyframe, motion-
// safe gated. Reduced-motion users see the rest state immediately.

'use client'
import Link from 'next/link'
import { Wordmark } from '@/components/Wordmark'
import { useTranslation } from '@/components/LanguageProvider'
import { buttonStyles } from '@/components/Button'

interface Props {
  /** Where the secondary Share link routes — `?step=2` first run,
   *  `?step=2&revisit=true` from Settings. */
  shareHref: string
  /** Top-right exit callback. "Skip" on first run, "Close" when revisiting. */
  onExit: () => void
  exitLabel: string
}

const STAGE_IN = 'motion-safe:animate-[stage-in_360ms_cubic-bezier(0.16,1,0.3,1)_both]'

export function OnboardingHub({ shareHref, onExit, exitLabel }: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col gap-8">
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

      {/* Body — heading + single Practice card + small Share fallback link.
          flex-1 + justify-center centres the composition on tall viewports;
          gap-7 gives the Practice card breathing room without isolating it
          from the heading. */}
      <div className="flex flex-1 flex-col justify-center gap-7 min-h-0">
        <h1
          className={`font-display text-3xl md:text-4xl font-medium text-text-primary ${STAGE_IN}`}
        >
          {t('onboarding.hub.heading')}
        </h1>

        {/* Practice — the single primary action. Mirrors the home page
            Practice CTA's treatment exactly (border-accent-primary/25 +
            bg-accent-primary/[0.04]) so the user sees the same brand
            language across both surfaces — the hub card visually becomes
            the "front door" of the same CTA they'll see on every
            subsequent home visit. Warmth comes from the cream `bg-bg`
            substrate showing through the low-opacity cool tint, not from
            an off-palette hue. Text-first composition: no icon tile, no
            eyebrow — the title carries the room. */}
        <Link
          href="/practice"
          className={`group flex flex-col gap-4 rounded-2xl border border-accent-primary/25 bg-accent-primary/[0.04] p-6 transition-all hover:bg-accent-primary/[0.08] hover:border-accent-primary/35 hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${STAGE_IN}`}
          style={{ animationDelay: '90ms' }}
        >
          <div className="space-y-2">
            <p className="text-lg font-semibold text-text-primary">
              {t('onboarding.hub.practice.title')}
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              {t('onboarding.hub.practice.body')}
            </p>
          </div>
          <span
            className={buttonStyles({
              variant: 'primary',
              fullWidth: true,
              className: 'rounded-xl py-3 group-hover:bg-accent-primary-hover',
            })}
          >
            {t('onboarding.hub.practice.cta')}
          </span>
        </Link>

        {/* Share fallback — a single text link below the Practice card.
            Most users who want to share a voice note arrive via the system
            share intent and never see this screen; the link is here for
            the minority who tap through onboarding first and want to
            preview the share flow. Quiet by design. */}
        <div className={`text-center ${STAGE_IN}`} style={{ animationDelay: '180ms' }}>
          <Link
            href={shareHref}
            className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t('onboarding.hub.share.linkText')}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
