'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DashboardReminders } from '@/components/DashboardReminders'
import { DashboardInProgress } from '@/components/DashboardInProgress'
import { DashboardRecentSessions } from '@/components/DashboardRecentSessions'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'
import { targetLanguageGreeting } from '@/lib/i18n'
import type { SessionListItem, SessionStatus } from '@/lib/types'
import type { DashboardSummary } from '@/lib/dashboard-summary'

// Peak-end welcome beat — shows for ~3s when the user arrives from
// onboarding completion (`/?welcome=true`). Onboarding sets the flag in
// `handleExit` / `handleShareNext`; we read it once on mount, immediately
// clear the URL so refresh doesn't retrigger, then dismiss after the beat.
const WELCOME_HOLD_MS = 3000

const TERMINAL_STATUSES = new Set<SessionStatus>(['ready', 'error'])

// Polling cadence — starts tight (so a freshly-uploaded clip flips to
// `ready` quickly when transcribing finishes) but backs off if the server
// keeps reporting the same status. Capped well under the typical
// pipeline duration so users never wait minutes between updates.
const POLL_BASE_MS = 3000
const POLL_BACKOFF = 1.5
const POLL_MAX_MS = 30_000


interface Props {
  initialSessions: SessionListItem[]
  initialSummary: DashboardSummary | null
}

export function HomeClient({ initialSessions, initialSummary }: Props) {
  const { t, targetLanguage } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const reducedMotion = useReducedMotion()
  const [sessions, setSessions] = useState<SessionListItem[]>(initialSessions)
  const [summary, setSummary] = useState<DashboardSummary | null>(initialSummary)
  // Read once on first render, then never again — we clear the URL param
  // in the effect below so subsequent reads would be `false` anyway.
  const initialWelcome = useMemo(
    () => searchParams.get('welcome') === 'true',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [showWelcome, setShowWelcome] = useState(initialWelcome)

  useEffect(() => {
    if (!initialWelcome) return
    // Clear the param immediately so a refresh doesn't retrigger the beat,
    // but the local `showWelcome` state keeps the message visible for the
    // hold window. `scroll: false` so we don't jump the page on replace.
    router.replace('/', { scroll: false })
    const timer = setTimeout(() => setShowWelcome(false), WELCOME_HOLD_MS)
    return () => clearTimeout(timer)
  }, [initialWelcome, router])
  // One pending timeout per polled session, plus per-session attempt
  // count for exponential backoff. Refs so the polling loop can read its
  // own latest state without re-binding on every render.
  const pollTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pollAttempts = useRef<Map<string, number>>(new Map())

  const greeting = useMemo(() => targetLanguageGreeting(targetLanguage, new Date()), [targetLanguage])

  const stopPolling = useCallback((sessionId: string) => {
    const id = pollTimeouts.current.get(sessionId)
    if (id) clearTimeout(id)
    pollTimeouts.current.delete(sessionId)
    pollAttempts.current.delete(sessionId)
  }, [])

  const stopAllPolling = useCallback(() => {
    pollTimeouts.current.forEach(id => clearTimeout(id))
    pollTimeouts.current.clear()
    pollAttempts.current.clear()
  }, [])

  const startPolling = useCallback((sessionId: string) => {
    if (pollTimeouts.current.has(sessionId)) return
    // No point burning poll cycles when the tab is hidden — the user
    // can't see the result. The visibility listener below restarts
    // these when focus returns.
    if (typeof document !== 'undefined' && document.hidden) return

    const attempt = pollAttempts.current.get(sessionId) ?? 0
    const delay = Math.min(POLL_BASE_MS * Math.pow(POLL_BACKOFF, attempt), POLL_MAX_MS)

    const timeoutId = setTimeout(async () => {
      pollTimeouts.current.delete(sessionId)
      try {
        const res = await fetch(`/api/sessions/${sessionId}/status`)
        if (!res.ok) {
          pollAttempts.current.set(sessionId, attempt + 1)
          startPolling(sessionId)
          return
        }
        const { status } = await res.json() as { status: SessionStatus }

        if (TERMINAL_STATUSES.has(status)) {
          pollAttempts.current.delete(sessionId)
          // Pull the canonical record once we know the pipeline finished.
          const listRes = await fetch('/api/sessions')
          if (listRes.ok) setSessions(await listRes.json())
          fetch('/api/dashboard-summary')
            .then(r => r.ok ? r.json() : null)
            .then((data: DashboardSummary | null) => { if (data) setSummary(data) })
            .catch(() => { /* non-critical */ })
        } else {
          // Status hasn't moved yet — keep our local row in sync and
          // back off for the next poll so a slow analysis pass doesn't
          // hammer the API every 3s for ten minutes.
          setSessions(prev =>
            prev.map(s => s.id === sessionId ? { ...s, status } : s)
          )
          pollAttempts.current.set(sessionId, attempt + 1)
          startPolling(sessionId)
        }
      } catch {
        pollAttempts.current.set(sessionId, attempt + 1)
        startPolling(sessionId)
      }
    }, delay)
    pollTimeouts.current.set(sessionId, timeoutId)
  }, [])

  // Initial poll fan-out for any sessions the server told us are still
  // in flight. The list itself came from the parent RSC so we don't
  // have to wait on a client fetch first.
  useEffect(() => {
    initialSessions.forEach(s => {
      if (!TERMINAL_STATUSES.has(s.status)) startPolling(s.id)
    })
    return () => stopAllPolling()
    // We deliberately depend only on the initial list — re-firing this
    // effect when `sessions` changes would double-poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pause polling when the tab is hidden, resume when it comes back.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        stopAllPolling()
        return
      }
      sessions.forEach(s => {
        if (!TERMINAL_STATUSES.has(s.status)) startPolling(s.id)
      })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [sessions, startPolling, stopAllPolling])

  const doUpload = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop() ?? 'mp3'
    const duration_seconds = await getAudioDuration(file)

    const createRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', extension: ext, original_filename: file.name }),
    })
    if (!createRes.ok) return
    const { session_id, upload_url } = await createRes.json() as { session_id: string; upload_url: string }

    // Navigate immediately — PipelineStatus polls and shows the uploading state.
    // The actual R2 PUT runs in the background; upload-failed is called on error
    // so the status page surfaces it via the error state.
    router.push(`/sessions/${session_id}/status`)

    void (async () => {
      try {
        const uploadRes = await fetch(upload_url, { method: 'PUT', body: file })
        if (!uploadRes.ok) throw new Error('Upload failed')
        await fetch(`/api/sessions/${session_id}/upload-complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ duration_seconds }),
        })
      } catch {
        await fetch(`/api/sessions/${session_id}/upload-failed`, { method: 'POST' })
      }
    })()
  }, [router])

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return
    readPendingShare().then(file => {
      if (file) void doUpload(file)
    })
    // Only run on mount — doUpload is stable (router dep is stable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSessionDeleted(id: string) {
    stopPolling(id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  const handleToggleRead = useCallback((id: string, makeRead: boolean) => {
    setSessions(prev =>
      prev.map(s =>
        s.id === id
          ? { ...s, last_viewed_at: makeRead ? new Date().toISOString() : null }
          : s,
      ),
    )
  }, [])

  const isFirstTime = sessions.length === 0

  const inProgressSessions = useMemo(
    () => sessions.filter(s => !TERMINAL_STATUSES.has(s.status)),
    [sessions],
  )
  const recentSessions = useMemo(
    () => sessions.filter(s => TERMINAL_STATUSES.has(s.status)),
    [sessions],
  )

  return (
    <div className="max-w-2xl mx-auto pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
      {/* Greeting + peak-end welcome beat.
          The welcome line sits above the greeting and animates in/out so
          the user's first impression of the home screen is the warm hand-
          off from onboarding. After WELCOME_HOLD_MS the message dismisses,
          leaving just the greeting + first-run subtitle. aria-live polite
          so screen-reader users hear it without it being announced as an
          alert. */}
      <header className="space-y-1.5">
        <AnimatePresence>
          {showWelcome && (
            <motion.p
              key="welcome-beat"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-sm font-medium text-accent-primary"
              aria-live="polite"
            >
              {t('home.welcomeBeat')}
            </motion.p>
          )}
        </AnimatePresence>
        <h1 className="font-display text-3xl md:text-4xl font-medium text-text-primary">
          {greeting}
        </h1>
        {isFirstTime && (
          <p className="text-text-secondary leading-relaxed">
            {t('home.firstRunSubtitle')}
          </p>
        )}
      </header>

      {/* Practice CTA — primary action, close to the greeting.
          The Share CTA below is a quiet alternative path: visually
          subordinate (text-row, no tint, smaller icon) so the hierarchy
          stays Practice-first while still surfacing the share-from-any-
          messaging-app flow that the home subtitle teaches in prose. */}
      <section aria-label={t('home.practiceCTATitle')} className="mt-8 space-y-2">
        <Link
          href="/practice"
          className="group flex items-center gap-5 rounded-2xl border border-accent-primary/25 bg-accent-primary/[0.04] px-6 py-5 hover:bg-accent-primary/[0.08] hover:border-accent-primary/35 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
        >
          <span className="flex-shrink-0 w-11 h-11 rounded-full bg-accent-chip flex items-center justify-center text-on-accent-chip">
            <Icon name="message" className="w-5 h-5" aria-hidden />
          </span>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-lg font-semibold text-text-primary">
              {t('home.practiceCTATitle')}
            </p>
            <p className="text-sm text-text-secondary">
              {t('home.practiceCTASubtitle', { language: t(`lang.${targetLanguage}`) })}
            </p>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="w-5 h-5 flex-shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>

        {/* Subtle Share CTA — quiet text row beneath Practice. Opens the
            share-from-WhatsApp tutorial (the same illustration the old
            onboarding hub linked to), so users learn the system share
            intent in-context rather than via a dedicated wizard step.
            Negative horizontal margin lets the row's hover bg breathe
            past the parent container's column without changing layout
            width — same trick used by Settings → Help list items. */}
        <Link
          href="/onboarding?step=2"
          data-testid="home-share-cta"
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 -mx-3 text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
        >
          <Icon name="waveform" className="w-4 h-4 flex-shrink-0 text-text-tertiary group-hover:text-text-secondary transition-colors" aria-hidden />
          <span className="flex-1 leading-relaxed">{t('home.shareCTA')}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="w-4 h-4 flex-shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </section>

      {/* Corrections reminder — secondary action, below the invite */}
      {!isFirstTime && (
        <div className="mt-8">
          <DashboardReminders summary={summary} />
        </div>
      )}

      {/* In-progress processing strip */}
      {inProgressSessions.length > 0 && (
        <div className="mt-8">
          <DashboardInProgress sessions={inProgressSessions} />
        </div>
      )}

      {/* Conversations */}
      <div className="mt-10">
        <DashboardRecentSessions
          sessions={recentSessions}
          onDeleted={handleSessionDeleted}
          onToggleRead={handleToggleRead}
        />
      </div>
    </div>
  )
}

function readPendingShare(): Promise<File | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open('conversation-coach-db', 1)
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result.createObjectStore('pending-share')
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('pending-share', 'readwrite')
      const store = tx.objectStore('pending-share')
      tx.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
      const getReq = store.get('file')
      getReq.onsuccess = () => {
        const file = (getReq as IDBRequest<File | undefined>).result ?? null
        if (file) store.delete('file')
        tx.oncomplete = () => resolve(file)
      }
      getReq.onerror = () => resolve(null)
    }
    req.onerror = () => resolve(null)
  })
}

async function getAudioDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio()
    audio.src = URL.createObjectURL(file)
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src)
      resolve(Math.round(audio.duration))
    }
    audio.onerror = () => resolve(0)
  })
}
