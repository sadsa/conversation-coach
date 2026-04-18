// components/DashboardReminders.tsx
//
// "Saved corrections" surface on the dashboard. The whole card is the
// action — one tap takes you to the Write list where you can mark
// items as written down. We deliberately do NOT preview individual
// items here: the dashboard can't act on them inline, so previews
// just slow scanning and create a redundant "look but don't touch"
// pattern. The Write list is the single workbench.
//
// Three states:
//   - summary === null   → calm skeleton at the same height as the card
//                          so the page doesn't jump when data lands.
//   - writeDownCount = 0 → quiet "all caught up" line, no card chrome,
//                          no CTA — there's nothing to do.
//   - writeDownCount > 0 → tinted card-as-button with the count baked
//                          into the CTA copy and a single trailing arrow.

'use client'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'
import type { DashboardSummary } from '@/lib/dashboard-summary'

interface Props {
  summary: DashboardSummary | null
}

export function DashboardReminders({ summary }: Props) {
  const { t } = useTranslation()

  if (summary === null) {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        aria-labelledby="reminders-heading"
      >
        <h2 id="reminders-heading" className="sr-only">
          {t('home.remindersAria')}
        </h2>
        <div
          data-testid="dashboard-reminders-loading"
          className="h-[68px] rounded-2xl border border-border-subtle bg-surface-elevated/40 animate-pulse"
        />
      </section>
    )
  }

  const { writeDownCount } = summary

  if (writeDownCount === 0) {
    return (
      <section aria-labelledby="reminders-heading">
        <h2 id="reminders-heading" className="sr-only">
          {t('home.remindersAria')}
        </h2>
        <p className="text-text-tertiary leading-relaxed">
          {t('home.allCaughtUp')}
        </p>
      </section>
    )
  }

  // Singular vs plural copy. The count is baked into the CTA so there's
  // no separate "3" sitting on the card — the CTA is the action AND the
  // signal in one phrase.
  const ctaCopy = writeDownCount === 1
    ? t('home.toWriteDownOne')
    : t('home.toWriteDown', { n: writeDownCount })

  return (
    <section aria-labelledby="reminders-heading">
      <h2 id="reminders-heading" className="sr-only">
        {t('home.remindersAria')}
      </h2>
      <Link
        href="/write"
        data-testid="widget-write-down"
        className="group flex items-center justify-between gap-4 rounded-2xl border border-widget-write-border bg-widget-write-bg/40 px-6 py-5 hover:bg-widget-write-bg/60 transition-colors"
      >
        <span className="text-base md:text-lg font-semibold text-widget-write-text">
          {ctaCopy}
        </span>
        {/*
          Arrow-right (not chevron) signals "take this action" rather
          than "navigate into a list". Subtle slide on hover reinforces
          the action affordance without being noisy.
        */}
        <svg
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          className="w-5 h-5 flex-shrink-0 text-widget-write-text transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>
    </section>
  )
}
