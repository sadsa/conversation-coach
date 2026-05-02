// components/VoiceWidget.tsx
//
// Floating voice-coach widget. Renders a labelled FAB (idle / connecting),
// or an expanded control pill (active / muted) anchored above the bottom
// nav. Hides entirely when there are no unwritten practice items to discuss.
//
// Surface chrome: matches the rest of the app's sheet/toast vocabulary —
// `--color-surface-elevated` on `--color-border` with a soft shadow. No dark
// glass, no `backdrop-blur` — the widget should read as a calm tool that's
// available, not a media-player overlay competing with the read.
//
// Audio-flow indicator: a single non-interactive dot whose colour is bound
// to who is speaking (`data-speaker="user" | "agent" | "idle"`) and whose
// scale tracks RMS via inline transform. The styling lives in the
// `.voice-indicator` rule in `globals.css` so reduced-motion users get the
// colour information but no movement.
//
// Keyboard: while active, Esc ends, Space toggles mute.
// Listener is only mounted while active; cleaned up on state change /
// unmount. Inputs and textareas are ignored so we don't fight forms.
//
// Cleanup: a single `useEffect` cleanup disconnects the agent and clears
// any pending toast timer if the user navigates away mid-session, so we
// don't leak the WebSocket or `setState` on an unmounted component.
'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'
import { useTranslation } from '@/components/LanguageProvider'
import { connect } from '@/lib/voice-agent'
import type { VoiceAgent, VoiceAgentState, FocusedCorrection } from '@/lib/voice-agent'
import type { PracticeItem } from '@/lib/types'

interface Props {
  /** Unwritten practice items. Widget hides entirely when empty. */
  initialItems: PracticeItem[]
}

type WidgetState = 'idle' | 'connecting' | 'active' | 'muted'
type Speaker = 'idle' | 'user' | 'agent'

// RMS thresholds — anything below `RMS_FLOOR` reads as silence. Tuned by ear
// against the Gemini Live PCM streams; mic noise floor sits ~0.002.
const RMS_FLOOR = 0.004
// Decay multiplier applied each animation frame (~16ms). 0.85 ≈ 200ms tail.
const RMS_DECAY = 0.85
// Inline scale ramp — keeps the dot quiet at rest, expressive at peak.
const SCALE_GAIN = 5
const SCALE_MAX = 0.45

function toFocusedCorrection(item: PracticeItem): FocusedCorrection {
  return {
    original: item.original,
    correction: item.correction,
    explanation: item.explanation,
  }
}

export function VoiceWidget({ initialItems }: Props) {
  const { t, targetLanguage } = useTranslation()
  const [widgetState, setWidgetState] = useState<WidgetState>('idle')
  const [toast, setToast] = useState<string | null>(null)
  const agentRef = useRef<VoiceAgent | null>(null)
  const toastKeyRef = useRef(0)
  const toastTimerRef = useRef<number | null>(null)

  // Audio-flow indicator — refs avoid re-rendering at audio rate. The rAF
  // loop reads them, decays, and writes the result directly to the DOM.
  const userRmsRef = useRef(0)
  const agentRmsRef = useRef(0)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  const items = initialItems

  const isActive = widgetState === 'active' || widgetState === 'muted'
  const isMuted = widgetState === 'muted'
  const isConnecting = widgetState === 'connecting'

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastKeyRef.current += 1
    setToast(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 4000)
  }, [])

  const handleStart = useCallback(async () => {
    if (widgetState !== 'idle' || items.length === 0) return
    setWidgetState('connecting')

    try {
      const agent = await connect(
        targetLanguage,
        items.map(toFocusedCorrection),
        {
          onStateChange: (state: VoiceAgentState) => {
            if (state === 'active') setWidgetState('active')
            else if (state === 'ended') {
              setWidgetState('idle')
              agentRef.current = null
            }
          },
          onError: (message: string) => {
            setWidgetState('idle')
            agentRef.current = null
            if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
              showToast(t('voice.micPermission'))
            } else {
              showToast(t('voice.sessionEnded'))
            }
          },
          onUserAudio: (rms) => { userRmsRef.current = Math.max(userRmsRef.current, rms) },
          onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
        }
      )
      agentRef.current = agent
    } catch {
      setWidgetState('idle')
      showToast(t('voice.micPermission'))
    }
  }, [widgetState, items, targetLanguage, t, showToast])

  const handleEnd = useCallback(() => {
    agentRef.current?.disconnect()
  }, [])

  const handleMute = useCallback(() => {
    if (!agentRef.current) return
    if (widgetState === 'muted') {
      agentRef.current.setMuted(false)
      setWidgetState('active')
    } else {
      agentRef.current.setMuted(true)
      setWidgetState('muted')
    }
  }, [widgetState])

  // Keyboard shortcuts — only mounted while active. Inputs / textareas /
  // contenteditable are ignored so we don't fight any future form on /write.
  useEffect(() => {
    if (!isActive) return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        handleEnd()
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        handleMute()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, handleEnd, handleMute])

  // Audio-flow indicator drive loop. Runs only while active. Reads RMS refs,
  // decays them, writes transform + data-speaker straight to the DOM so we
  // don't trigger React re-renders at frame rate.
  useEffect(() => {
    if (!isActive) {
      userRmsRef.current = 0
      agentRmsRef.current = 0
      return
    }
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function tick() {
      const u = userRmsRef.current
      const a = agentRmsRef.current
      userRmsRef.current = u * RMS_DECAY
      agentRmsRef.current = a * RMS_DECAY

      const el = indicatorRef.current
      if (el) {
        let speaker: Speaker = 'idle'
        if (!isMuted) {
          if (a > u && a > RMS_FLOOR) speaker = 'agent'
          else if (u > RMS_FLOOR) speaker = 'user'
        }
        el.dataset.speaker = speaker
        el.dataset.muted = isMuted ? 'true' : 'false'

        if (!reducedMotion) {
          const peak = Math.max(u, a)
          const scale = 1 + Math.min(SCALE_MAX, peak * SCALE_GAIN)
          el.style.transform = `scale(${scale.toFixed(3)})`
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [isActive, isMuted])

  // Disconnect the agent and clear any pending toast on unmount so a route
  // change mid-session doesn't leak the WebSocket or fire setState on an
  // unmounted component.
  useEffect(() => {
    return () => {
      agentRef.current?.disconnect()
      agentRef.current = null
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  if (items.length === 0) return null

  // Idle / connecting share the labelled-FAB chrome — same shape, same
  // position, only the leading icon and the label change. Single tap target
  // means no fight between "tap to start" and "wait, it's already going."
  const fabLabel = isConnecting ? t('voice.connecting') : t('voice.startLabel')

  return (
    <>
      <span aria-live="polite" className="sr-only">
        {isConnecting
          ? t('voice.connecting')
          : isActive
          ? isMuted
            ? t('voice.indicatorMuted')
            : t('voice.indicatorIdle')
          : ''}
      </span>

      {!isActive && (
        <div
          className="fixed left-4 z-40"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 8px)' }}
        >
          <button
            type="button"
            onClick={handleStart}
            disabled={isConnecting}
            aria-busy={isConnecting}
            className="
              flex h-12 items-center gap-2 rounded-full
              bg-surface-elevated border border-border
              pl-3 pr-4 text-sm font-medium text-text-primary
              shadow-md
              hover:bg-bg active:scale-95
              transition-[transform,background-color]
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
              disabled:cursor-wait
            "
          >
            <Icon
              name={isConnecting ? 'spinner' : 'mic'}
              className="w-5 h-5 text-accent-primary"
            />
            <span>{fabLabel}</span>
          </button>
        </div>
      )}

      {isActive && (
        <div
          className="fixed left-0 right-0 z-40 flex flex-col items-center gap-2 px-3"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 10px)' }}
        >
          <div
            role="toolbar"
            aria-label={t('voice.toolbarAria')}
            className="
              flex items-center gap-1
              bg-surface-elevated border border-border rounded-full
              px-1 py-1
              shadow-lg
            "
          >
            {/* Audio-flow indicator. Non-interactive on purpose — the only
                "mic" affordance lives on the mute button to its right. */}
            <div
              className="w-9 h-9 flex items-center justify-center"
              aria-hidden="true"
            >
              <div ref={indicatorRef} className="voice-indicator" data-speaker="idle" />
            </div>

            <button
              type="button"
              onClick={handleMute}
              aria-label={isMuted ? t('voice.unmuteAria') : t('voice.muteAria')}
              aria-pressed={isMuted}
              className="
                w-9 h-9 rounded-full flex items-center justify-center
                text-text-secondary
                hover:text-text-primary hover:bg-bg
                aria-pressed:bg-error-surface aria-pressed:text-on-error-surface
                transition-colors
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
              "
            >
              <Icon name={isMuted ? 'mic-off' : 'mic'} className="w-5 h-5" />
            </button>

            {/* End is reversible (no data lost — the user can restart any
                time) so the hover state stays neutral. Red is reserved for
                genuinely destructive actions elsewhere in the app. */}
            <button
              type="button"
              onClick={handleEnd}
              aria-label={t('voice.endAria')}
              className="
                w-9 h-9 rounded-full flex items-center justify-center
                text-text-secondary
                hover:text-text-primary hover:bg-bg
                transition-colors
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
              "
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} toastKey={toastKeyRef.current} />}
    </>
  )
}
