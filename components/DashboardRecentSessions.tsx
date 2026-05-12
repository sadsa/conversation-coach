// components/DashboardRecentSessions.tsx
//
// Wraps SessionList with a dashboard-friendly cap: shows only the most
// recent N sessions by default, with an unobtrusive "Show all (N)" /
// "Show fewer" toggle when there are more.
//
// Always renders — even with zero sessions — so the section header and
// upload trigger are consistently available as a secondary entry point
// for manual audio uploads.

'use client'
import { useState, useMemo, useRef } from 'react'
import { SessionList } from '@/components/SessionList'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'
import { validateAudioFile } from '@/lib/audio-upload'
import type { SessionListItem } from '@/lib/types'

const DEFAULT_VISIBLE = 5

interface UploadProps {
  onFile: (file: File) => void
  onPickInvalid?: (message: string) => void
  disabled?: boolean
}

interface Props {
  sessions: SessionListItem[]
  onDeleted?: (id: string) => void
  /**
   * Optimistic read-toggle handoff. The page owns the canonical sessions
   * array; we forward the row's request straight up without buffering. A
   * second call with the inverse value is treated as a rollback.
   */
  onToggleRead?: (id: string, makeRead: boolean) => void
  uploadProps?: UploadProps
  /** When false, suppresses the "no recordings yet" empty-state copy —
   *  used on first-run where the page subtitle already covers this. */
  showEmptyMessage?: boolean
  /** Upload/validation error to surface near the upload trigger. */
  uploadError?: string | null
}

export function DashboardRecentSessions({
  sessions,
  onDeleted,
  onToggleRead,
  uploadProps,
  showEmptyMessage = true,
  uploadError,
}: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)

  const visible = useMemo(
    () => (expanded ? sessions : sessions.slice(0, DEFAULT_VISIBLE)),
    [sessions, expanded],
  )

  const hiddenCount = Math.max(0, sessions.length - DEFAULT_VISIBLE)

  function pickFile() {
    if (uploadProps?.disabled) return
    uploadRef.current?.click()
  }

  return (
    <section aria-labelledby="recent-sessions-heading" className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <h2
          id="recent-sessions-heading"
          className="text-sm font-medium text-text-secondary uppercase tracking-wider"
        >
          {t('home.recentSessionsTitle')}
        </h2>

        {uploadProps && (
          <>
            <input
              ref={uploadRef}
              type="file"
              accept=".mp3,.m4a,.wav,.ogg,.opus,.aac"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                const err = validateAudioFile(f, t)
                if (err) {
                  uploadProps.onPickInvalid?.(err)
                  return
                }
                uploadProps.onFile(f)
              }}
            />
            <button
              type="button"
              onClick={pickFile}
              disabled={uploadProps.disabled}
              aria-busy={uploadProps.disabled || undefined}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm text-text-secondary hover:bg-surface-elevated hover:border-border-subtle transition-colors disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
            >
              {uploadProps.disabled
                ? <Icon name="spinner" className="w-3.5 h-3.5" aria-hidden />
                : <Icon name="plus" className="w-3.5 h-3.5" aria-hidden />
              }
              {t('home.uploadRecording')}
            </button>
          </>
        )}
      </header>

      {uploadError && (
        <p className="text-sm text-status-error" aria-live="polite">{uploadError}</p>
      )}

      {sessions.length === 0 ? (
        showEmptyMessage && (
          <p className="text-sm text-text-tertiary leading-relaxed">
            {t('home.noRecordingsYet')}
          </p>
        )
      ) : (
        <>
          <SessionList
            sessions={visible}
            onDeleted={onDeleted}
            onToggleRead={onToggleRead}
          />

          {hiddenCount > 0 && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setExpanded(prev => !prev)}
                aria-expanded={expanded}
                className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5"
              >
                {expanded
                  ? t('home.recentShowFewer')
                  : t('home.recentShowAll', { n: sessions.length })}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
