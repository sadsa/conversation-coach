// components/DashboardOnboarding.tsx
//
// First-time experience for the dashboard. Renders only when the user has
// no sessions yet — the empty state IS the onboarding, so it self-resets
// the moment they upload their first conversation. No localStorage flag,
// no "dismiss" button: less state to drift, less to forget.
//
// Visual approach: four numbered cards stacked in a single column. Big,
// readable numerals act as the visual rhythm so the eye moves down the
// page in clear beats. Tone matches `.impeccable.md` — patient and
// encouraging, never performative.

'use client'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'

interface Step {
  titleKey: string
  descKey: string
}

const STEPS: Step[] = [
  { titleKey: 'home.step1.title', descKey: 'home.step1.desc' },
  { titleKey: 'home.step2.title', descKey: 'home.step2.desc' },
  { titleKey: 'home.step3.title', descKey: 'home.step3.desc' },
  { titleKey: 'home.step4.title', descKey: 'home.step4.desc' },
]

export function DashboardOnboarding() {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby="dashboard-onboarding-heading"
      data-testid="dashboard-onboarding"
      className="space-y-6"
    >
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-tertiary">
          {t('home.howItWorks')}
        </p>
        <h2 id="dashboard-onboarding-heading" className="text-xl font-semibold text-text-primary">
          {t('home.welcomeTitle')}
        </h2>
        <p className="text-text-secondary leading-relaxed max-w-prose">
          {t('home.welcomeSubtitle')}
        </p>
      </header>

      <ol className="space-y-3" role="list">
        {STEPS.map((step, idx) => (
          <li
            key={step.titleKey}
            className="flex gap-5 rounded-xl border border-border-subtle bg-surface px-5 py-4"
          >
            <span
              aria-hidden="true"
              className="flex-shrink-0 self-start mt-0.5 font-semibold text-2xl text-text-tertiary tabular-nums w-6 text-center"
            >
              {idx + 1}
            </span>
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-text-primary leading-snug">
                {t(step.titleKey)}
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">
                {t(step.descKey)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <Link
        href="/onboarding?step=1&revisit=true"
        className="inline-block text-sm text-text-tertiary hover:text-accent-primary transition-colors"
      >
        {t('onboarding.revisitLink')}
      </Link>
    </section>
  )
}
