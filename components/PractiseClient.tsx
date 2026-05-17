// components/PractiseClient.tsx
//
// Client island for `/` — the Practise landing page, the first impression
// of the methodology. Three doors:
//
//   1. Pick up a call    → /practice?mode=call  (Gemini Live voice agent)
//   2. Casual chat       → /practice?mode=chat  (Gemini Live voice agent)
//   3. Share a voice note → /onboarding?step=2  (WhatsApp share illustration)
//
// Above the doors sits a Practise → Review → Study eyebrow that names the
// pillars of the methodology. The current pillar (Practise on /) reads in
// the accent colour; the other two are plain links to their routes. The
// row is the shared `<MethodologyEyebrow>` so /, /review, and /write all
// render the same chrome.
//
// This component also owns the share-target pickup — when WhatsApp/Signal/
// Telegram hand the app a voice note via the Web Share Target API, the
// service worker writes the file to IndexedDB and redirects the browser to
// `/`. We read the pending file on mount, create a session, and navigate
// straight to its status screen. The R2 PUT runs as a background fire-and-
// forget so the user never lands on the dashboard during the wait.

'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Icon } from '@/components/Icon'
import { MethodologyEyebrow } from '@/components/MethodologyEyebrow'
import { useTranslation } from '@/components/LanguageProvider'
import { targetLanguageGreeting } from '@/lib/i18n'

// Peak-end welcome beat — shows for ~3s when the user arrives from
// onboarding completion (`/?welcome=true`). Onboarding sets the flag in
// `handleExit` / `handleShareNext`; we read it once on mount, immediately
// clear the URL so refresh doesn't retrigger, then dismiss after the beat.
const WELCOME_HOLD_MS = 3000

// The Practise home no longer takes any server-fetched data — the
// methodology eyebrow's old "study count" badge was retired, and the
// share-target pickup reads from IndexedDB on mount. Keep an empty
// interface so the export shape is explicit if future state needs
// threading through.
type Props = Record<string, never>

export function PractiseClient(_props: Props) {
  const { t, targetLanguage } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const reducedMotion = useReducedMotion()

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

  const greeting = useMemo(
    () => targetLanguageGreeting(targetLanguage, new Date()),
    [targetLanguage],
  )

  // ── Share-target pickup ──────────────────────────────────────────────
  // When a voice note arrives via the system share sheet, the service
  // worker stores the file in IndexedDB and redirects to `/`. Read it,
  // POST a session, and push straight to the status screen — the R2 PUT
  // runs in the background.
  const doUpload = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop() ?? 'mp3'
    const duration_seconds = await getAudioDuration(file)

    const createRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', extension: ext, original_filename: file.name }),
    })
    if (!createRes.ok) return
    const { session_id, upload_url } =
      (await createRes.json()) as { session_id: string; upload_url: string }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    // Page rhythm matches /review, /write, /settings: layout owns the
    // column width and bottom clearance for BottomNav, this wrapper
    // owns only the page-internal section gap (space-y-8 = 32px). The
    // old `max-w-2xl mx-auto` was a no-op (layout already caps at
    // max-w-2xl) and the old `pb-[6rem+safe]` over-corrected for a
    // BottomNav overlap that's now solved in app/layout.tsx via
    // --bottom-nav-h.
    <div className="space-y-8">
      {/* Greeting + peak-end welcome beat. The welcome line floats above
          the greeting via absolute positioning so it doesn't shift the
          rest of the page when it mounts/dismisses. We only reserve the
          `pt-6` slot for the beat when ?welcome=true is in the URL on
          mount — otherwise the page top sits flush with the layout's
          baseline, matching Review / Study / Settings. */}
      <header className={`relative space-y-2${initialWelcome ? ' pt-6' : ''}`}>
        <AnimatePresence>
          {showWelcome && (
            <motion.p
              key="welcome-beat"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-0 top-0 text-sm font-medium text-accent-primary"
              aria-live="polite"
            >
              {t('home.welcomeBeat')}
            </motion.p>
          )}
        </AnimatePresence>
        <h1 className="font-display text-3xl md:text-4xl font-medium text-text-primary">
          {greeting}
        </h1>

        <MethodologyEyebrow active="practise" />
      </header>

      {/* ── Three doors ────────────────────────────────────────────────
          Call · Chat · Share. Each card is a single navigation target —
          tap anywhere on the row opens the destination. Call mode wears
          the project's emerald call-* palette (matched to the
          `cc-call-pulse` ring on the active call screen so the visual
          language is continuous). Chat and Share take quieter neutral
          surfaces so Call is the visually loudest door without
          overpowering the page. Labelled via `aria-labelledby` rather
          than aria-label so the visible H2 isn't read twice.

          The H2 ("How do you want to practise?") lives INSIDE the
          section, not in the header above — it's the question the
          cards answer, so it groups with them (proximity = meaning).
          The wrapper's space-y-8 already gives a 32px break between
          the orientation header (greeting + eyebrow) and this action
          block; the H2 then sits with 24px of air before the first
          card, and the three cards stay tight at space-y-3 between
          themselves. Varied rhythm: tight inside the cards, generous
          moment around the question. */}
      <section aria-labelledby="practise-question" className="space-y-6">
        {/* H2 prompt for the doors below. Promoted from <p> so screen
            reader heading navigation surfaces it, and so the section
            can `aria-labelledby` this id without duplicating the
            visible text in an aria-label. */}
        <h2
          id="practise-question"
          className="text-base font-normal text-text-secondary leading-relaxed"
        >
          {t('home.subhead')}
        </h2>

        <div className="space-y-3">
        {/* Pick up a call */}
        <Link
          href="/practice?mode=call"
          data-testid="home-mode-call"
          className="group flex items-center gap-4 rounded-2xl border border-call-border bg-call-bg px-5 py-4 hover:bg-call-bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-call-fill focus-visible:ring-offset-2"
        >
          <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-call-fill text-white flex items-center justify-center">
            <Icon name="phone" className="w-5 h-5" aria-hidden />
          </span>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-base md:text-lg font-semibold text-text-primary">
              {t('practice.modeCallTitle')}
            </p>
            <p className="text-sm text-text-secondary leading-snug">
              {t('practice.modeCallBlurb')}
            </p>
          </div>
          <ChevronRight />
        </Link>

        {/* Casual chat */}
        <Link
          href="/practice?mode=chat"
          data-testid="home-mode-chat"
          className="group flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface px-5 py-4 hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
        >
          <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-accent-chip text-on-accent-chip flex items-center justify-center">
            <Icon name="message" className="w-5 h-5" aria-hidden />
          </span>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-base md:text-lg font-semibold text-text-primary">
              {t('practice.modeChatTitle')}
            </p>
            <p className="text-sm text-text-secondary leading-snug">
              {t('practice.modeChatBlurb')}
            </p>
          </div>
          <ChevronRight />
        </Link>

        {/* Share a voice note — third peer door, not a buried secondary.
            Deep-links into the existing share-from-WhatsApp tutorial at
            /onboarding?step=2 (single-step deep-dive page; closes back to
            /). Same chrome shape as the Chat card; quieter icon palette
            (surface-elevated) so the three doors read as a visual rhythm
            of call → chat → share rather than three competing primary
            actions. */}
        <Link
          href="/onboarding?step=2"
          data-testid="home-mode-share"
          className="group flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface px-5 py-4 hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
        >
          <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-surface-elevated text-text-secondary flex items-center justify-center">
            <Icon name="export" className="w-5 h-5" aria-hidden />
          </span>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-base md:text-lg font-semibold text-text-primary">
              {t('home.modeShareTitle')}
            </p>
            <p className="text-sm text-text-secondary leading-snug">
              {t('home.modeShareBlurb')}
            </p>
          </div>
          <ChevronRight />
        </Link>
        </div>
      </section>
    </div>
  )
}

// Shared chevron used on all three door rows. Inline SVG (rather than
// pulling from Icon) because the hover-translate is tied to the parent
// `group` and the shared stroke weight is already correct for this scale.
function ChevronRight() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="w-5 h-5 flex-shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ── Share-target IndexedDB read ────────────────────────────────────────
// Mirrors the implementation that lived in the old HomeClient. The store
// is the same (`conversation-coach-db` / `pending-share`) so files queued
// by an earlier visit are still picked up after the redesign.
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
