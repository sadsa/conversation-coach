// components/ProcessingGraphic.tsx
//
// The shared "we're working on it" graphic used by every long-running
// async surface in the app (audio upload pipeline + post-conversation
// transcript generation). One visual, one motion vocabulary, so the
// shape of "patient processing" is consistent wherever the user lands.
//
// Visual: eleven vertical bars arranged as a varied waveform silhouette.
// They pulse gently, gather into a short uniform line (the "transcript
// line"), hold, then breathe back out. ~3.6s loop. The collapse moment
// IS the metaphor — audio gathered into written text — so the cycle
// rhythm is intentionally slow enough that the moment lands.
//
// All visual state is driven by CSS keyframes in globals.css under the
// `.processing-graphic` selector. Reduced-motion users see a single
// peak frame held statically (the global 0.01ms clamp resolves the
// keyframe to its 0% value, which is the full waveform silhouette).
//
// Sizing: defaults to 56px tall (hero scale), matching the spacing
// the consolidated processing screen reserves around it. A `compact`
// prop drops the bars to 40px / tighter gaps for any future inline use.
'use client'
import type { CSSProperties } from 'react'

// Per-bar peak heights (0..1). Hand-tuned to read as a waveform shape —
// not random. Asymmetry across the row reads as "real audio" vs the
// uniform staircase a generated sequence would produce.
const PEAKS = [0.40, 0.72, 0.55, 0.95, 0.68, 0.85, 0.58, 0.92, 0.62, 0.75, 0.42]

interface Props {
  className?: string
  /** Smaller variant for inline / non-hero usage. Defaults to false. */
  compact?: boolean
  /** Aria label override. Defaults to a generic "Processing" announcement. */
  label?: string
}

export function ProcessingGraphic({ className = '', compact = false, label = 'Processing' }: Props) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`processing-graphic ${compact ? 'processing-graphic--compact' : ''} ${className}`}
    >
      {PEAKS.map((peak, i) => (
        <span
          key={i}
          className="processing-graphic__bar"
          style={{ '--peak': peak } as CSSProperties}
        />
      ))}
    </div>
  )
}
