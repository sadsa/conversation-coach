// components/DashboardOnboarding.tsx
//
// First-run experience for the dashboard. Renders only when the user has
// no sessions yet — the empty state IS the onboarding, so it self-resets
// the moment they upload their first conversation. No localStorage flag,
// no "dismiss" button: less state to drift, less to forget.
//
// Deliberately small: a short welcome and two clear actions. The richer
// teaching (animated phone-frame illustrations, gestures, multi-step
// pacing) lives in the dedicated wizard at /onboarding. We don't try to
// duplicate it here as a flat list — that path produced a generic
// "1, 2, 3, 4 numbered cards" template that drifted out of sync with the
// real UI. Instead we send users into the wizard for the tour, or
// straight into uploading if they'd rather learn by doing.

'use client'
import { useRef } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'
import { ACCEPTED_EXTENSIONS, validateAudioFile } from '@/lib/audio-upload'

interface Props {
  onUpload?: (file: File) => void
  onPickInvalid?: (message: string) => void
  uploadDisabled?: boolean
}

export function DashboardOnboarding({ onUpload, onPickInvalid, uploadDisabled }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = !!uploadDisabled
  const uploadLabel = busy ? t('home.uploading') : t('home.uploadFabLabel')

  function pick() {
    if (busy) return
    inputRef.current?.click()
  }

  return (
    <section
      aria-labelledby="dashboard-onboarding-heading"
      data-testid="dashboard-onboarding"
      className="space-y-6 max-w-prose"
    >
      <div className="space-y-3">
        <h2
          id="dashboard-onboarding-heading"
          className="text-xl font-semibold text-text-primary"
        >
          {t('home.welcomeTitle')}
        </h2>
        <p className="text-text-secondary leading-relaxed">
          {t('home.welcomeSubtitle')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/onboarding?step=1&revisit=true"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-primary px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t('home.startTutorial')}
          <Icon name="chevron-right" className="w-4 h-4" aria-hidden />
        </Link>

        {onUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                const err = validateAudioFile(f, t)
                if (err) {
                  onPickInvalid?.(err)
                  return
                }
                onUpload(f)
              }}
            />
            <button
              type="button"
              onClick={pick}
              disabled={busy}
              aria-busy={busy}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-5 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60"
            >
              {uploadLabel}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
