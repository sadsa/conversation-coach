'use client'
//
// Generic full-content-area loading screen — the "Robot Patient" concept.
//
// Delight layer: a random Rioplatense phrase fades in below the dots each
// load — a tiny teaching moment while the user waits. Suppressed when
// prefers-reduced-motion is set (phrase still renders, entrance animation skips).
//
// The SVG is inlined (rather than delegating to <LogoMark>) so Framer Motion
// can target individual elements (eye blinks).

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

// Rioplatense phrases that are short enough to read in a glance and genuinely
// useful to a Spanish learner. Chosen for voseo register and River Plate vocab.
const PHRASES: { es: string; en: string }[] = [
  { es: '¿Cómo andás?',   en: 'How are you doing?' },
  { es: 'Enseguida',      en: 'Right away' },
  { es: '¡Bárbaro!',      en: 'Fantastic!' },
  { es: 'Dale',           en: 'Sure / Go ahead' },
  { es: 'Un toque',       en: 'Just a sec' },
  { es: '¿Todo bien?',    en: 'All good?' },
  { es: 'Buenas',         en: 'Hey there' },
  { es: '¡Qué copado!',   en: 'How cool!' },
  { es: 'Re bueno',       en: 'Really good' },
  { es: 'Tranqui',        en: 'Take it easy' },
  { es: 'Che',            en: 'Hey / Mate' },
  { es: 'Ya voy',         en: "I'm on my way" },
  { es: 'Piola',          en: 'Cool / Chill' },
  { es: 'Mirá vos',       en: 'Well, well…' },
  { es: 'Genial',         en: 'Great' },
]

// ─── Eye blink ───────────────────────────────────────────────────────────────

const EYE_BLINK = {
  scaleY: [1, 1, 0.07, 1, 1],
  opacity: [1, 1, 0.3,  1, 1],
}

const EYE_TRANSITION = {
  duration: 4.2,
  repeat: Infinity,
  ease: 'easeInOut' as const,
  times: [0, 0.87, 0.91, 0.94, 1],
}

// ─── Hopping dots ────────────────────────────────────────────────────────────

const DOT_ANIMATION = {
  y:       [0, -4, 0],
  opacity: [0.35, 1, 0.35],
}

const DOT_TRANSITION = {
  duration: 1.7,
  repeat: Infinity,
  ease: 'easeInOut' as const,
}

// ─── Static fallbacks (prefers-reduced-motion) ───────────────────────────────

const EYE_STATIC = { scaleY: 1, opacity: 1 }
const DOT_STATIC = { y: 0, opacity: 0.5 }

export function LoadingScreen() {
  const reduceMotion = useReducedMotion()

  // Picked client-side only to avoid SSR/hydration mismatch from Math.random().
  const [phrase, setPhrase] = useState<typeof PHRASES[0] | null>(null)
  useEffect(() => {
    setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)])
  }, [])

  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="flex-1 min-h-0 flex flex-col items-center justify-center gap-[18px]"
    >
      {/* ── Robot ─────────────────────────────────────────────────────── */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="140 145 744 662"
        width="80"
        height="80"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ls-face" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#0f5a3f" />
            <stop offset="100%" stopColor="#0a3f2f" />
          </linearGradient>
        </defs>

        {/* Antenna */}
        <circle cx="512" cy="214" r="43" fill="#d0eca7" stroke="#0f6545" strokeWidth="16" />
        <rect x="499" y="256" width="26" height="42" rx="8" fill="#0f6545" />

        {/* Body — fill adapts to theme */}
        <rect
          x="230" y="292" width="564" height="490" rx="150"
          fill="var(--color-surface)" stroke="#0f6545" strokeWidth="18"
        />

        {/* Left arm */}
        <rect x="165" y="498" width="76" height="148" rx="26" fill="#c7e59c" stroke="#0f6545" strokeWidth="14" />

        {/* Right arm */}
        <rect x="783" y="498" width="76" height="148" rx="26" fill="#c7e59c" stroke="#0f6545" strokeWidth="14" />

        {/* Face panel */}
        <rect
          x="284" y="432" width="456" height="260" rx="90"
          fill="url(#ls-face)" stroke="#0f6545" strokeWidth="14"
        />

        {/* Eye glows — blink unless reduced motion */}
        <motion.ellipse
          cx="372" cy="560" rx="44" ry="54" fill="#c7e59c"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          animate={reduceMotion ? EYE_STATIC : EYE_BLINK}
          transition={EYE_TRANSITION}
        />
        <motion.ellipse
          cx="652" cy="560" rx="44" ry="54" fill="#c7e59c"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          animate={reduceMotion ? EYE_STATIC : EYE_BLINK}
          transition={{ ...EYE_TRANSITION, delay: 0.06 }}
        />

        {/* Pupils */}
        <ellipse cx="350" cy="535" rx="18" ry="22" fill="#ffffff" />
        <ellipse cx="630" cy="535" rx="18" ry="22" fill="#ffffff" />

        {/* Smile */}
        <path d="M468 620c22 20 66 20 88 0" fill="none" stroke="#c7e59c" strokeLinecap="round" strokeWidth="16" />
      </svg>

      {/* ── Hopping dots ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-[6px]" aria-hidden="true">
        {([0, 0.22, 0.44] as const).map((delay, i) => (
          <motion.div
            key={i}
            className="w-[5px] h-[5px] rounded-full bg-text-tertiary"
            animate={reduceMotion ? DOT_STATIC : DOT_ANIMATION}
            transition={{ ...DOT_TRANSITION, delay }}
          />
        ))}
      </div>

      {/* ── Rioplatense phrase — appears after client hydration, fades in ── */}
      {phrase && (
        <motion.div
          className="flex flex-col items-center gap-1 text-center"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
        >
          <p className="text-sm font-medium text-text-secondary">{phrase.es}</p>
          <p className="text-xs text-text-tertiary">{phrase.en}</p>
        </motion.div>
      )}
    </div>
  )
}
