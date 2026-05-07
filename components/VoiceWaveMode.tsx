// components/VoiceWaveMode.tsx
//
// Immersive coaching-mode overlay for mobile voice sessions.
// Replaces the bottom nav footprint while a session is active or connecting.
//
// Single fixed wrapper (pointer-events:none) contains three layers:
//   1. Gradient bleed — transparent→accent wash from 16rem above the bottom
//   2. Wave canvas — Canvas 2D sine waves driven by audio RMS (active/muted only)
//   3. Controls strip — mute/end (active/muted) or spinner (connecting)
//
// voiceState drives which variant renders:
//   'connecting' — gradient + spinner, no canvas (no audio data yet)
//   'active'     — gradient + wave canvas + mute/end controls
//   'muted'      — same as active with muted amplitude + pressed mute style
//
// exiting — applied by BottomBar during the 280ms exit animation window
// before unmounting, so the gradient fades rather than snapping away.
//
// CSS variable --voice-bottom-height is written on mount and cleared on
// unmount so <main>'s paddingBottom grows to prevent content being hidden
// under the controls strip.
'use client'
import { useEffect, useRef } from 'react'
import type React from 'react'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'

const LAYERS = [
  { freqMult: 1.0, speedMult: 1.00, alpha: 0.70, widthPx: 2.0 },
  { freqMult: 1.6, speedMult: 0.75, alpha: 0.35, widthPx: 1.5 },
  { freqMult: 2.3, speedMult: 0.55, alpha: 0.18, widthPx: 1.0 },
] as const

const AMP_BASE   = 7
const AMP_PEAK   = 38
const AMP_LERP   = 0.12
const BASE_CYCLE_PX = 320
const BASE_SPEED = 1.2

// Height of the controls strip — matches --voice-bottom-height.
const CONTROLS_HEIGHT = 'calc(6rem + env(safe-area-inset-bottom))'

interface Props {
  voiceState: 'connecting' | 'active' | 'muted'
  audioTickCallbackRef: React.MutableRefObject<((u: number, a: number, muted: boolean) => void) | null>
  onMute: () => void
  onEnd: () => void
  exiting?: boolean
}

export function VoiceWaveMode({ voiceState, audioTickCallbackRef, onMute, onEnd, exiting }: Props) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const connecting = voiceState === 'connecting'
  const muted = voiceState === 'muted'
  const animClass = exiting ? 'voice-wave-exit' : 'voice-wave-anim'

  // Set --voice-bottom-height so <main> grows its padding-bottom to prevent
  // content being hidden under the controls strip.
  useEffect(() => {
    document.documentElement.style.setProperty('--voice-bottom-height', CONTROLS_HEIGHT)
    return () => {
      document.documentElement.style.removeProperty('--voice-bottom-height')
    }
  }, [])

  // Wave canvas — only registered when not connecting (no audio data yet).
  useEffect(() => {
    if (connecting) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function resize() {
      if (!canvas) return
      const w = canvas.offsetWidth || window.innerWidth
      const h = canvas.offsetHeight || 96
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('resize', resize)

    let smoothAmp = AMP_BASE
    let frameTime = 0
    let lastTs = performance.now()

    function draw(u: number, a: number, isMuted: boolean) {
      if (!canvas || !ctx) return

      const now = performance.now()
      const dt = now - lastTs
      lastTs = now
      frameTime += (dt / 1000) * BASE_SPEED

      const peak = Math.max(u, a)
      const targetAmp = isMuted ? AMP_BASE * 0.5 : AMP_BASE + peak * (AMP_PEAK - AMP_BASE)
      smoothAmp += (targetAmp - smoothAmp) * AMP_LERP

      const cssW = canvas.offsetWidth
      const cssH = canvas.offsetHeight
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cssW, cssH)

      const midY = cssH * 0.42

      if (reducedMotion) {
        ctx.beginPath()
        ctx.moveTo(0, midY)
        ctx.lineTo(cssW, midY)
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'
        ctx.lineWidth = 2
        ctx.stroke()
        return
      }

      for (const layer of LAYERS) {
        const freq  = (Math.PI * 2 * layer.freqMult) / BASE_CYCLE_PX
        const phase = frameTime * layer.speedMult + LAYERS.indexOf(layer) * 1.1
        const amp   = smoothAmp * (1 - LAYERS.indexOf(layer) * 0.22)

        ctx.beginPath()
        for (let x = 0; x <= cssW; x += 3) {
          const y = midY + Math.sin(x * freq + phase) * amp
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(255,255,255,${layer.alpha})`
        ctx.lineWidth   = layer.widthPx
        ctx.lineJoin    = 'round'
        ctx.stroke()
      }
    }

    audioTickCallbackRef.current = draw

    return () => {
      if (audioTickCallbackRef.current === draw) {
        audioTickCallbackRef.current = null
      }
      ro.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [audioTickCallbackRef, connecting])

  return (
    // Single wrapper — pointer-events:none on the gradient zone, restored
    // on the controls strip. One element = one exit animation.
    <div
      aria-hidden={connecting ? true : undefined}
      className={`md:hidden fixed left-0 right-0 bottom-0 pointer-events-none ${animClass}`}
      style={{ height: 'calc(16rem + env(safe-area-inset-bottom))', zIndex: 28 }}
    >
      {/* ── Gradient bleed ── */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: [
            'linear-gradient(to bottom,',
            '  transparent                                              0%,',
            '  color-mix(in oklch, var(--color-accent-primary)  4%, transparent) 30%,',
            '  color-mix(in oklch, var(--color-accent-primary) 20%, transparent) 55%,',
            '  color-mix(in oklch, var(--color-accent-primary) 50%, transparent) 72%,',
            '  color-mix(in oklch, var(--color-accent-primary) 78%, transparent) 85%,',
            '  var(--color-accent-primary)                             100%',
            ')',
          ].join(' '),
        }}
      />

      {/* ── Wave canvas — active/muted only ── */}
      {!connecting && (
        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute left-0 bottom-0 w-full"
          style={{ height: CONTROLS_HEIGHT, zIndex: 1 }}
        />
      )}

      {/* ── Controls strip ── */}
      <div
        role={connecting ? undefined : 'region'}
        aria-label={connecting ? undefined : t('voice.regionAria')}
        aria-keyshortcuts={connecting ? undefined : 'Escape Space'}
        className="absolute left-0 right-0 bottom-0"
        style={{ height: CONTROLS_HEIGHT, zIndex: 10, pointerEvents: 'auto' }}
      >
        <div
          className="h-full flex items-center px-6 gap-4"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {connecting ? (
            // Connecting state — spinner only, no interactive controls yet.
            <>
              <span className="flex-1 text-sm text-white/60 select-none">
                {t('voice.connecting')}
              </span>
              <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                <Icon name="spinner" className="w-5 h-5 text-white/70" />
              </div>
            </>
          ) : (
            // Active / muted state — full controls.
            <>
              <span className="flex-1 text-sm text-white/60 select-none">
                {muted ? t('voice.statusMuted') : t('voice.statusListening')}
              </span>

              <button
                type="button"
                onClick={onMute}
                aria-label={muted ? t('voice.unmuteAria') : t('voice.muteAria')}
                aria-pressed={muted}
                className="
                  w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0
                  text-white/80 hover:text-white hover:bg-white/15
                  aria-pressed:bg-white/20 aria-pressed:text-white/50
                  transition-colors
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
                "
              >
                <Icon name={muted ? 'mic-off' : 'mic'} className="w-5 h-5" />
              </button>

              {/* White hover first; red only on active press to avoid the
                  warm-cool clash between rose and the violet accent bg. */}
              <button
                type="button"
                onClick={onEnd}
                aria-label={t('voice.endAria')}
                className="
                  ml-2 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0
                  text-white/80 hover:text-white hover:bg-white/15 active:bg-rose-500/25
                  transition-colors
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
                "
              >
                <Icon name="close" className="w-5 h-5" />
              </button>

              <span aria-live="polite" className="sr-only">
                {muted ? t('voice.indicatorMuted') : t('voice.statusListening')}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
