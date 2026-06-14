// components/PractiseClient.tsx
//
// Client island for `/` — the Practise landing page, the first impression
// of the methodology. Two doors:
//
//   1. Free flow         → starts a Gemini Live chat session in-place (primary)
//   2. Real Life Scenario → starts a Gemini Live call session in-place (secondary)
//
// The Share/upload door was retired from this screen — see ADR 0002. Upload
// entry points live in the Review step.
//
// The Call and Chat doors used to navigate to `/practice?mode=…`; that
// route was retired so that discarding a session returns the user to the
// home doors (where they came from) instead of stranding them on an
// orphaned `/practice` idle screen. `<PracticeClient>` now mounts inside
// this component when a session is active, and we flip `activeMode` back
// to null on `onExit` to restore the doors view. The `targetLanguage`
// prop comes from the server-side auth header for both shells.
//
// This component also owns the share-target pickup — when WhatsApp/Signal/
// Telegram hand the app a voice note via the Web Share Target API, the
// service worker writes the file to IndexedDB and redirects the browser to
// `/`. We read the pending file on mount, create a session, and navigate
// straight to its status screen. The R2 PUT runs as a background fire-and-
// forget so the user never lands on the dashboard during the wait.

'use client'
import { useState, useEffect, useCallback, useMemo, type ComponentProps } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Icon } from '@/components/Icon'
import { InstallBanner } from '@/components/InstallBanner'
import { useTranslation } from '@/components/LanguageProvider'
import { nativeLanguageGreeting, inferUiLanguage } from '@/lib/i18n'
import { PracticeClient, type PracticeMode } from '@/components/PracticeClient'

// ── Conversation-starter categories ────────────────────────────────────
// Kept in lockstep with CATEGORIES in app/api/practice-starters/route.ts.
// The model returns one of these per topic; the client maps it to a
// Phosphor/stroke glyph (CATEGORY_ICON) so we never render arbitrary emoji.
const STARTER_CATEGORIES = [
  'food', 'travel', 'work', 'home', 'people',
  'media', 'city', 'plans', 'opinion', 'misc',
] as const
type Category = (typeof STARTER_CATEGORIES)[number]

type IconName = ComponentProps<typeof Icon>['name']

// `satisfies` checks at compile time that every value is a real icon name,
// so a typo'd glyph fails the build rather than rendering blank.
const CATEGORY_ICON = {
  food: 'utensils',
  travel: 'plane',
  work: 'briefcase',
  home: 'house',
  people: 'users',
  media: 'film',
  city: 'buildings',
  plans: 'calendar',
  opinion: 'lightbulb',
  misc: 'message',
} satisfies Record<Category, IconName>

interface Starter {
  topic: string
  category: Category
}

function coerceCategory(value: unknown): Category {
  return STARTER_CATEGORIES.includes(value as Category) ? (value as Category) : 'misc'
}

// Peak-end welcome beat — shows for ~3s when the user arrives from
// onboarding completion (`/?welcome=true`). Onboarding sets the flag in
// `handleExit` / `handleShareNext`; we read it once on mount, immediately
// clear the URL so refresh doesn't retrigger, then dismiss after the beat.
const WELCOME_HOLD_MS = 3000

interface Props {
  /** First name from Google OAuth user_metadata. Absent for magic-link users. */
  displayName?: string | null
}

export function PractiseClient({ displayName: _displayName }: Props = {}) {
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

    // The active voice session, if any. null = doors view. Setting this mounts
  // <PracticeClient> in place of the doors; onExit flips it back to null when
  // the user discards, ends with no speech, or hits a fatal connection error.
  // `starterTopic` is set when the user taps a chip on the Free flow card —
  // it seeds the Coach's opening question.
  const [activeSession, setActiveSession] = useState<{
    mode: PracticeMode
    starterTopic?: string
  } | null>(null)
  const handleExitSession = useCallback(() => setActiveSession(null), [])

  const greeting = useMemo(
    () => nativeLanguageGreeting(targetLanguage, new Date()),
    [targetLanguage],
  )

  // Dynamic starter topics — fetched fresh on each mount so returning users
  // always see new suggestions. null = loading (show skeleton buttons);
  // Starter[] = loaded. On error (or a malformed payload) we fall back to the
  // static translation strings with sensible category icons.
  const [starters, setStarters] = useState<Starter[] | null>(null)
  useEffect(() => {
    const lang = inferUiLanguage(targetLanguage)
    const fallback: Starter[] = [
      { topic: t('practice.chatStarter.0'), category: 'plans' },
      { topic: t('practice.chatStarter.1'), category: 'food' },
      { topic: t('practice.chatStarter.2'), category: 'city' },
    ]
    fetch(`/api/practice-starters?lang=${lang}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(({ starters: s }: { starters?: unknown }) => {
        if (!Array.isArray(s) || s.length === 0) throw new Error('empty')
        const cleaned = s
          .map(item => ({
            topic: String((item as Starter)?.topic ?? '').trim(),
            category: coerceCategory((item as Starter)?.category),
          }))
          .filter(x => x.topic.length > 0)
        if (cleaned.length === 0) throw new Error('empty')
        setStarters(cleaned)
      })
      .catch(() => setStarters(fallback))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Session in progress — replace the home doors with the active session UI.
  if (activeSession !== null) {
    return (
      <PracticeClient
        mode={activeSession.mode}
        targetLanguage={targetLanguage}
        starterTopic={activeSession.starterTopic}
        onExit={handleExitSession}
      />
    )
  }

  return (
    // Page rhythm matches /review, /write, /settings: layout owns the
    // column width and bottom clearance for BottomNav, this wrapper
    // owns only the page-internal section gap (space-y-8 = 32px). The
    // old `max-w-2xl mx-auto` was a no-op (layout already caps at
    // max-w-2xl) and the old `pb-[6rem+safe]` over-corrected for a
    // BottomNav overlap that's now solved in app/layout.tsx via
    // --bottom-nav-h.
    <div className="space-y-8">
      {/* Greeting kicker + topic question + peak-end welcome beat. The
          target-language greeting is kept as a small kicker above the H1 —
          it's the one immersion moment on this surface (and the anchor the
          welcome beat floats above) — but the headline is now the question,
          which frames the topic buttons below as the answer. The welcome
          line floats above via absolute positioning so it doesn't shift the
          rest of the page when it mounts/dismisses; we only reserve the
          `pt-6` slot for it when ?welcome=true is in the URL on mount. */}
      <header className={`relative space-y-1.5${initialWelcome ? ' pt-6' : ''}`}>
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
        <p className="text-sm font-medium text-text-tertiary">
          {greeting}
        </p>
        <h1 className="text-page-title">
          {t('home.practiseHeading')}
        </h1>

        <InstallBanner />
      </header>

      {/* ── Two labelled mode sections ─────────────────────────────────
          The page offers exactly two Conversation modes (CONTEXT.md). Each
          is its own titled section (h2 + one-line "what it is") so the
          difference between them is explicit rather than inferred from a
          flat list. Talk freely is primary and expanded — the generated
          topic chips nest inside it as quick-starts (they all start a chat
          session, just seeded with a topic), with a neutral "no topic" row
          beneath. Real Life Scenario is the compact secondary mode. */}

      {/* Talk freely — primary mode. Topic chips are shortcuts into this
          mode (each seeds a chat session); the trailing row is the no-topic
          entry. Nothing here carries extra fill — the chips' accent tiles
          are the only colour, so the section reads as one grouped mode. */}
      <section aria-labelledby="mode-chat-heading" className="space-y-3">
        <div className="space-y-1">
          <h2
            id="mode-chat-heading"
            className="text-lg font-semibold text-text-primary"
          >
            {t('practice.modeChatTitle')}
          </h2>
          <p className="text-sm text-text-secondary leading-snug">
            {t('practice.modeChatBlurb')}
          </p>
        </div>

        <div className="space-y-3">
          {/* Generated topics. null = loading → full-width skeleton buttons
              so the page is usable instantly (the no-topic row + Call render
              immediately) and topics stream in without layout shift. */}
          {starters === null
            ? [0, 1, 2].map(i => <StarterSkeleton key={i} />)
            : starters.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  data-testid={`home-starter-${i}`}
                  onClick={() => setActiveSession({ mode: 'chat', starterTopic: s.topic })}
                  className="w-full text-left group flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface px-5 py-4 hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
                >
                  <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-accent-chip text-accent-primary flex items-center justify-center">
                    <Icon name={CATEGORY_ICON[s.category]} className="w-5 h-5" aria-hidden />
                  </span>
                  <p className="flex-1 min-w-0 text-base md:text-lg font-semibold text-text-primary">
                    {s.topic}
                  </p>
                  <ChevronRight />
                </button>
              ))
          }

          {/* No-topic entry — the plain "just start" door into Talk freely.
              Neutral icon tile (vs the topic chips' accent tiles) marks it as
              the topic-free option without adding a louder card. */}
          <button
            type="button"
            onClick={() => setActiveSession({ mode: 'chat' })}
            data-testid="home-mode-chat"
            className="w-full text-left group flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface px-5 py-4 hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
          >
            <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-surface-elevated text-text-secondary flex items-center justify-center">
              <Icon name="mic" className="w-5 h-5" aria-hidden />
            </span>
            <p className="flex-1 min-w-0 text-base md:text-lg font-semibold text-text-primary">
              {t('practice.modeChatNoTopic')}
            </p>
            <ChevronRight />
          </button>
        </div>
      </section>

      {/* Real Life Scenario — secondary mode, beta. Compact: title + blurb,
          then a single action row. The emerald icon tile signals "call" via
          colour. Beta badge sits beside the title to surface maturity before
          the user taps. */}
      <section aria-labelledby="mode-call-heading" className="space-y-3">
        <div className="space-y-1">
          <h2
            id="mode-call-heading"
            className="text-lg font-semibold text-text-primary flex items-center gap-2"
          >
            {t('practice.modeCallTitle')}
            <span className="text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ring-1 ring-border bg-surface-elevated text-text-tertiary leading-none">
              Beta
            </span>
          </h2>
          <p className="text-sm text-text-secondary leading-snug">
            {t('practice.modeCallBlurb')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setActiveSession({ mode: 'call' })}
          data-testid="home-mode-call"
          className="w-full text-left group flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface px-5 py-4 hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
        >
          <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-call-fill text-white flex items-center justify-center">
            <Icon name="phone" className="w-5 h-5" aria-hidden />
          </span>
          <p className="flex-1 min-w-0 text-base md:text-lg font-semibold text-text-primary">
            {t('practice.modeCallStart')}
          </p>
          <ChevronRight />
        </button>
      </section>
    </div>
  )
}

// Loading placeholder for a topic button — same footprint as the real row
// (icon tile + label) so topics streaming in don't shift the Talk freely
// anchor or the Call door below.
function StarterSkeleton() {
  return (
    <div
      className="w-full flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface px-5 py-4"
      aria-hidden="true"
    >
      <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-surface-elevated animate-pulse" />
      <span className="h-4 flex-1 max-w-[60%] rounded-full bg-surface-elevated animate-pulse" />
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
