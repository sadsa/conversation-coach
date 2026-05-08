// components/AudioReactiveDots.tsx
//
// Seven vertical dots whose heights ripple with audio amplitude.
//
// At silence all dots sit at their resting height (a flat baseline).
// On speech a travelling sine wave drives each dot's height proportional
// to the smoothed amplitude. The wave phase is anchored to wall-clock
// time via `performance.now()` so speed is consistent regardless of tick
// rate — no drift from variable RAF timing.
//
// Reactivity uses the same asymmetric lerp as the bar it replaces:
// quick rise on speech onset, slow fall back to resting. Dots use
// `bg-accent-primary`; opacity is also amplitude-driven so the cluster
// fades in naturally as speech begins and fades out on silence.
//
// Props:
//   compact — tighter sizing for the 44px desktop strip (default: false,
//             sized for the 64px mobile strip).
'use client'
import { useEffect, useRef } from 'react'
import type React from 'react'
import type { VoiceTickCallback } from '@/components/VoiceController'

const NUM_DOTS   = 7
const SCALE_GAIN = 5
const SCALE_MAX  = 0.45
const LERP_RISE  = 0.20
const LERP_FALL  = 0.045

interface DotConfig {
  dotW: number     // dot width px
  restH: number    // resting height px
  maxH: number     // max height px
  gap: number      // gap between dots px
  wrapH: number    // wrapper height px
}

const CONFIG_NORMAL: DotConfig = { dotW: 3,   restH: 3,  maxH: 20, gap: 4, wrapH: 24 }
const CONFIG_COMPACT: DotConfig = { dotW: 2.5, restH: 2,  maxH: 14, gap: 3, wrapH: 18 }

interface Props {
  audioTickCallbacksRef: React.MutableRefObject<Set<VoiceTickCallback>>
  /** Smaller sizing variant for the 44px desktop strip. */
  compact?: boolean
  className?: string
}

export function AudioReactiveDots({ audioTickCallbacksRef, compact = false, className = '' }: Props) {
  const dotsRef = useRef<(HTMLDivElement | null)[]>(Array(NUM_DOTS).fill(null))
  const cfg = compact ? CONFIG_COMPACT : CONFIG_NORMAL

  useEffect(() => {
    const set = audioTickCallbacksRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let smoothAmp = 0

    function tick(u: number, a: number, isMuted: boolean) {
      if (reducedMotion) return

      const uN = isMuted ? 0 : Math.min(SCALE_MAX, u * SCALE_GAIN) / SCALE_MAX
      const aN = Math.min(SCALE_MAX, a * SCALE_GAIN) / SCALE_MAX
      const peak = Math.max(uN, aN)

      smoothAmp += (peak - smoothAmp) * (peak > smoothAmp ? LERP_RISE : LERP_FALL)
      const amp = smoothAmp < 0.005 ? 0 : smoothAmp

      // Wall-clock time drives wave phase — consistent speed regardless of
      // tick rate, and survives tab-visibility pauses gracefully.
      const t = performance.now() / 1000

      for (let i = 0; i < NUM_DOTS; i++) {
        const dot = dotsRef.current[i]
        if (!dot) continue

        const phase = (i / (NUM_DOTS - 1)) * Math.PI * 2
        const wave = Math.sin(t * 6 + phase) * 0.5 + 0.5  // 0..1

        const h = amp > 0.02
          ? cfg.restH + wave * amp * (cfg.maxH - cfg.restH)
          : cfg.restH
        const opacity = amp > 0.02
          ? 0.3 + wave * amp * 0.7
          : 0.25

        dot.style.height  = h.toFixed(1) + 'px'
        dot.style.opacity = opacity.toFixed(2)
      }
    }

    set.add(tick)
    return () => { set.delete(tick) }
  }, [audioTickCallbacksRef, cfg.restH, cfg.maxH])

  return (
    <div
      aria-hidden
      className={`flex items-center flex-shrink-0 ${className}`}
      style={{ gap: cfg.gap + 'px', height: cfg.wrapH + 'px' }}
    >
      {Array.from({ length: NUM_DOTS }, (_, i) => (
        <div
          key={i}
          ref={el => { dotsRef.current[i] = el }}
          className="rounded-full bg-accent-primary flex-shrink-0"
          style={{
            width:   cfg.dotW + 'px',
            height:  cfg.restH + 'px',
            opacity: 0.25,
          }}
        />
      ))}
    </div>
  )
}
