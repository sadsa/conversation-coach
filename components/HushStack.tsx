// components/HushStack.tsx
//
// The "Hush" correction treatment: the sentence-first body shape that the
// docked sheets share. A tiny tracked-uppercase eyebrow names what the user
// is looking at, the wrong fragment sits below in italic Source Serif 4 with
// a soft strike-through, and the rewrite lands as a large serif answer line
// in the correction-text token.
//
//   ┌────────────────────────┐
//   │ YOU SAID               │   ← eyebrow (tracked uppercase tertiary)
//   │ como soy               │   ← italic serif, struck through, tertiary
//   │ como me                │   ← large serif, correction-text
//   └────────────────────────┘
//
// Naturalness annotations carry `correction === null` — there is no rewrite,
// only a flagged fragment. In that case we drop the strike + answer treatment
// and surface the wrong fragment with a quiet steel-blue underline
// (`naturalness-underline` token) rather than the amber that
// `CorrectionInContext` historically used. Amber is reserved across the app
// for warnings (pipeline failures, late-session timer); a naturalness
// annotation isn't a warning, it's a "softly notice this" cue. The caller
// is responsible for passing the right eyebrow text ("Sounds off" for
// naturalness, "You said" for grammar) — HushStack doesn't decide on its
// own so the i18n stays in one place.
//
// Replaces the old AnnotationCard inline "<original> → <correction>" pair
// and the WriteSheet `<CorrectionInContext>` block. The Hush direction
// trades surrounding-sentence context for visual calm — re-engagement with
// the source sentence is handled by the session-source link on WriteSheet
// and by the AnnotationSheet's docked relationship to the live transcript.

import type { JSX, ReactNode } from 'react'

interface Props {
  /** Tracked uppercase label rendered above the original line. */
  eyebrow: string
  /** The wrong fragment (what the user actually said). */
  original: string
  /** The rewrite. `null` for naturalness annotations — no rewrite exists. */
  correction: string | null
  /**
   * Optional id for screen-reader landmarks if a consumer needs to point
   * `aria-describedby` at the answer line.
   */
  answerId?: string
  /**
   * Optional content rendered right-aligned in the eyebrow row (e.g. mobile
   * action buttons). Rendered outside the aria-hidden eyebrow text so
   * interactive elements remain accessible.
   */
  eyebrowAction?: ReactNode
}

export function HushStack({ eyebrow, original, correction, answerId, eyebrowAction }: Props): JSX.Element {
  const isNaturalness = correction === null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div
          className="text-eyebrow"
          aria-hidden="true"
        >
          {eyebrow}
        </div>
        {eyebrowAction}
      </div>

      {isNaturalness ? (
        // Naturalness fallback — no answer line. The fragment is surfaced
        // with the `naturalness-underline` token (quiet steel-blue), keeping
        // amber free for its "warning" job elsewhere in the app. No
        // duplicative `sr-only` here — the visible text IS the
        // screen-reader text; doubling it just makes ATs read the fragment
        // twice for no gain.
        <p className="font-display text-xl md:text-2xl leading-tight text-text-primary">
          <span className="underline decoration-naturalness-underline/80 decoration-2 underline-offset-4">
            {original}
          </span>
        </p>
      ) : (
        <>
          <p
            className="
              font-display italic text-lg md:text-xl leading-tight
              text-text-tertiary
              line-through decoration-[1.5px] decoration-text-tertiary/40
              tracking-[-0.005em]
            "
          >
            {original}
          </p>
          <p
            id={answerId}
            className="
              font-display font-medium text-3xl md:text-[2.25rem] leading-[1.1]
              text-correction tracking-[-0.02em]
              pt-1
            "
          >
            {correction}
          </p>
          {/* Visually hidden semantic anchor — the strike + insert is a visual
              idiom that doesn't translate cleanly to assistive tech. */}
          <span className="sr-only">{` — ${original} → ${correction}`}</span>
        </>
      )}
    </div>
  )
}
