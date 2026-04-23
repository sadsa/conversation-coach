// components/DashboardOnboarding.tsx
//
// First-run empty-state secondary action for the Recordings page. Renders
// only when the user has no sessions yet, and self-resets the moment they
// upload their first recording. No localStorage flag, no "dismiss" — less
// state to drift, less to forget.
//
// Reduced to a subtle text link. The primary action is the global Upload
// FAB (with a one-shot attention pulse on first run); the page subtitle
// invites that upload directly. By the time the user lands here they've
// already been through (or skipped) the wizard, so the tutorial entry
// point is purely a refresher — it shouldn't compete visually with the
// FAB. A loud accent-primary CTA here was inverting the hierarchy.

'use client'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'

export function DashboardOnboarding() {
  const { t } = useTranslation()

  return (
    <Link
      data-testid="dashboard-onboarding"
      href="/onboarding?step=1"
      className="inline-block text-sm text-text-tertiary underline decoration-text-tertiary/40 decoration-1 underline-offset-4 transition-colors hover:text-text-secondary hover:decoration-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {t('home.revisitTutorial')}
    </Link>
  )
}
