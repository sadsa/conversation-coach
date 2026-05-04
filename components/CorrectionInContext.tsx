// components/CorrectionInContext.tsx
//
// Unified "correction-in-context" treatment: the source sentence with the
// wrong fragment struck through and the rewrite inserted inline right after
// it. Replaces the old `StrikeOriginal` + separate `ContextSnippet` stack on
// surfaces that have segment data (the Write list row + the Write sheet).
//
// Why this shape:
//   - The wrong word lives in its real context — no abstraction, no need to
//     hold "what I said" + "what I should have said" in working memory.
//   - The fix sits exactly where it belongs in the sentence, so the eye
//     reads sentence → strike → correction → continue without a jump.
//   - One block instead of two saves ~one line per row in the list and a
//     full section in the sheet, which compounds across long queues.
//
// Fallbacks:
//   - `correction === null` (naturalness annotations with no rewrite):
//     render the sentence with just the wrong fragment tinted — no strike,
//     no correction insert. Keeps the user oriented without inventing a fix.
//   - No segment data (`segmentText`/`startChar`/`endChar` null): caller
//     should fall back to `StrikeOriginal` (which we re-export below for
//     surfaces that mix both states, e.g. the empty-state teaching example).
//
// Surface scaling: `'sheet'` bumps the sentence and correction one notch so
// it acts as the body's hero; `'row'` keeps everything compact for the list.

import type { JSX } from 'react'

/** How much surrounding sentence to show on either side of the error span. */
const SNIPPET_CONTEXT = 15

interface Props {
  segmentText: string
  startChar: number
  endChar: number
  /** The wrong fragment (already inside `segmentText[startChar..endChar]`). */
  original: string
  /** The rewrite. `null` means there's no correction (e.g. naturalness). */
  correction: string | null
  /** Visual scale — `'row'` (compact) or `'sheet'` (display, slightly larger). */
  size?: 'row' | 'sheet'
  /** Lower-contrast styling for the "Written" archive view. */
  muted?: boolean
  /** Test hook on the wrapping <p>. */
  testId?: string
}

export function CorrectionInContext({
  segmentText,
  startChar,
  endChar,
  original,
  correction,
  size = 'row',
  muted = false,
  testId,
}: Props): JSX.Element {
  const snippetStart = Math.max(0, startChar - SNIPPET_CONTEXT)
  const snippetEnd = Math.min(segmentText.length, endChar + SNIPPET_CONTEXT)

  // We slice out of `segmentText` (not `original`) on purpose — the
  // segment's character offsets are the source of truth for what was said.
  // `original` is informational (rendered in the sheet header for ARIA), so
  // we never use it to drive what appears in the sentence itself.
  const prefix = segmentText.slice(snippetStart, startChar)
  const errorFragment = segmentText.slice(startChar, endChar)
  const suffix = segmentText.slice(endChar, snippetEnd)

  const wrapperSizeClass =
    size === 'sheet'
      ? 'text-base md:text-lg leading-relaxed'
      : 'text-base leading-relaxed'

  // Sentence body colour — softer than the corrected fragment so the eye
  // lands on the strike → correction pair, not the surrounding context.
  const sentenceColor = muted ? 'text-text-tertiary' : 'text-text-secondary'
  const strikeColor = muted
    ? 'text-text-tertiary/70 line-through decoration-text-tertiary/30'
    : 'text-text-tertiary line-through decoration-text-tertiary/40'
  const correctionColor = muted ? 'text-text-secondary' : 'text-correction'
  const correctionWeight =
    size === 'sheet' ? 'font-semibold text-lg md:text-xl' : 'font-semibold'
  // Naturalness fallback (no rewrite) — tint the wrong fragment instead of
  // striking it, since there's nothing to replace it with.
  const flagColor = muted
    ? 'text-text-secondary'
    : 'text-text-primary font-medium underline decoration-pill-amber/60 decoration-2 underline-offset-4'

  return (
    <p data-testid={testId} className={`${wrapperSizeClass} ${sentenceColor}`}>
      {snippetStart > 0 && '…'}
      {prefix}
      {correction === null ? (
        <span className={flagColor}>{errorFragment}</span>
      ) : (
        <>
          <span className={strikeColor}>{errorFragment}</span>{' '}
          <span className={correctionColor + ' ' + correctionWeight}>
            {correction}
          </span>
        </>
      )}
      {suffix}
      {snippetEnd < segmentText.length && '…'}
      {/* Visually hidden semantic anchor — pairs the original with the
          correction for screen readers, since the strike+inline insert is
          a visual idiom that doesn't translate cleanly to assistive tech. */}
      {correction !== null && (
        <span className="sr-only">
          {' — '}{original} → {correction}
        </span>
      )}
    </p>
  )
}
