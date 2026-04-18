// components/DashboardUploadStarter.tsx
//
// Wraps the existing DropZone in a labelled "Start a new session" section
// for the returning-user dashboard. The label is the demoted treatment —
// the dashboard's primary content is the review surface (reminders +
// recent sessions), not the upload, but the upload still has to be one
// scroll away. This section title plus the existing DropZone hits both
// goals without inventing a new control.

'use client'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  children: React.ReactNode
}

export function DashboardUploadStarter({ children }: Props) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="new-session-heading" className="space-y-3">
      <header className="space-y-1">
        <h2
          id="new-session-heading"
          className="text-sm font-medium text-text-secondary uppercase tracking-wider"
        >
          {t('home.newSessionTitle')}
        </h2>
        <p className="text-sm text-text-tertiary">
          {t('home.newSessionSubtitle')}
        </p>
      </header>
      {children}
    </section>
  )
}
