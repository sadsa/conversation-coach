// components/DashboardInProgress.tsx
//
// Surfaces sessions that are still moving through the pipeline at the top
// of the dashboard so the user has a calm scan signal — "here's what's
// brewing in the background" — without having to scroll to the recent
// conversations list to find them.
//
// In-progress sessions live ONLY in this callout. Once they reach a
// terminal status (`ready` or `error`) they drop into the Recent
// Conversations list below — no row appears in both places. Hidden
// entirely when nothing is processing.

'use client'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem, SessionStatus } from '@/lib/types'

interface Props {
  sessions: SessionListItem[]
}

const STATUS_LABEL_KEY: Record<SessionStatus, string> = {
  uploading: 'status.uploading',
  transcribing: 'status.transcribing',
  identifying: 'status.identifying',
  analysing: 'status.analysing',
  ready: 'status.ready',
  error: 'status.error',
}

export function DashboardInProgress({ sessions }: Props) {
  const { t } = useTranslation()
  if (sessions.length === 0) return null

  return (
    <section
      aria-labelledby="in-progress-heading"
      data-testid="dashboard-in-progress"
      className="space-y-3"
    >
      <header className="flex items-center justify-between gap-3">
        <h2
          id="in-progress-heading"
          className="text-sm font-medium text-text-secondary uppercase tracking-wider"
        >
          {t('home.inProgressTitle')}
        </h2>
        <span className="text-xs text-text-tertiary tabular-nums">
          {sessions.length === 1
            ? t('home.inProgressCountOne')
            : t('home.inProgressCountMany', { n: sessions.length })}
        </span>
      </header>

      <ul className="rounded-xl border border-border-subtle bg-surface divide-y divide-border-subtle" role="list">
        {sessions.map(session => (
          <li key={session.id}>
            <Link
              href={
                session.status === 'identifying'
                  ? `/sessions/${session.id}/identify`
                  : `/sessions/${session.id}/status`
              }
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-elevated transition-colors group"
            >
              {/*
                Tiny inline spinner — same shape as in SessionList row but
                paired here with a brand-tinted ring instead of red, since
                "processing" is neutral, not an error state.
              */}
              <span aria-hidden="true" className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5">
                <svg
                  className="w-4 h-4 animate-spin text-status-processing"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {session.title}
                </p>
                <p className="text-xs text-status-processing mt-0.5">
                  {t(STATUS_LABEL_KEY[session.status])}
                </p>
              </div>

              <svg
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-4 h-4 text-text-tertiary flex-shrink-0 group-hover:text-text-secondary transition-colors"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
