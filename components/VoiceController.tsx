// components/VoiceController.tsx
//
// Lives above the route inside ConditionalNav. Owns the WebSocket / mic /
// AudioContext via VoiceAgent so the session survives in-app navigation.
//
// State machine: idle → connecting → active ↔ muted → idle.
// Cleanup: a single useEffect cleanup disconnects the agent if
// ConditionalNav unmounts (sign-out, entering an auth-public route).
//
// Page-context hint is computed at start() time, not on every render. Once
// connected, the agent's mental model of "where you are" doesn't whiplash
// when the user navigates mid-session.
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { connect } from '@/lib/voice-agent'
import type { VoiceAgent, VoiceAgentState, VoiceRouteContext } from '@/lib/voice-agent'

const RMS_DECAY = 0.85
const RMS_FLOOR = 0.004
const SCALE_GAIN = 5
const SCALE_MAX = 0.45

export type VoiceControllerState = 'idle' | 'connecting' | 'active' | 'muted'

export interface VoiceController {
  state: VoiceControllerState
  toast: string | null
  indicatorRef: React.RefObject<HTMLDivElement | null>
  start: () => void
  toggleMute: () => void
  end: () => void
}

function deriveRouteContext(pathname: string | null): VoiceRouteContext {
  if (!pathname) return { kind: 'other' }
  if (pathname.startsWith('/write')) return { kind: 'write' }
  if (pathname.startsWith('/sessions/')) {
    const sessionTitle = typeof window !== 'undefined' ? window.__ccSessionTitle : undefined
    if (sessionTitle) return { kind: 'session', sessionTitle }
  }
  return { kind: 'other' }
}

export function useVoiceController(): VoiceController {
  const { t, targetLanguage } = useTranslation()
  const pathname = usePathname()
  const [state, setState] = useState<VoiceControllerState>('idle')
  const [toast, setToast] = useState<string | null>(null)

  const agentRef = useRef<VoiceAgent | null>(null)
  const userRmsRef = useRef(0)
  const agentRmsRef = useRef(0)
  const indicatorRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 4000)
  }, [])

  const start = useCallback(async () => {
    if (state !== 'idle') return
    setState('connecting')

    try {
      const agent = await connect(
        targetLanguage,
        [],
        {
          onStateChange: (s: VoiceAgentState) => {
            if (s === 'active') setState('active')
            else if (s === 'ended') {
              setState('idle')
              agentRef.current = null
            }
          },
          onError: (message: string) => {
            setState('idle')
            agentRef.current = null
            if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
              showToast(t('voice.micPermission'))
            } else {
              showToast(t('voice.sessionEnded'))
            }
          },
          onUserAudio: (rms) => { userRmsRef.current = Math.max(userRmsRef.current, rms) },
          onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
        },
        deriveRouteContext(pathname)
      )
      agentRef.current = agent
    } catch (err) {
      setState('idle')
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
        showToast(t('voice.micPermission'))
      } else {
        showToast(t('voice.sessionEnded'))
      }
    }
  }, [state, targetLanguage, pathname, t, showToast])

  const end = useCallback(() => {
    agentRef.current?.disconnect()
  }, [])

  const toggleMute = useCallback(() => {
    if (!agentRef.current) return
    if (state === 'muted') {
      agentRef.current.setMuted(false)
      setState('active')
    } else if (state === 'active') {
      agentRef.current.setMuted(true)
      setState('muted')
    }
  }, [state])

  // Keyboard shortcuts — only mounted while in an active session.
  useEffect(() => {
    if (state !== 'active' && state !== 'muted') return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        end()
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        toggleMute()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, end, toggleMute])

  // Audio-flow indicator drive loop. Reads RMS refs, decays them, writes
  // transform + data-speaker straight to the DOM so we don't trigger React
  // re-renders at frame rate.
  useEffect(() => {
    if (state !== 'active' && state !== 'muted') {
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
        let speaker: 'idle' | 'user' | 'agent' = 'idle'
        if (state !== 'muted') {
          if (a > u && a > RMS_FLOOR) speaker = 'agent'
          else if (u > RMS_FLOOR) speaker = 'user'
        }
        el.dataset.speaker = speaker
        el.dataset.muted = state === 'muted' ? 'true' : 'false'

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
  }, [state])

  // Disconnect the agent and clear any pending toast on unmount so a
  // ConditionalNav unmount (sign-out, auth-public route) doesn't leak the
  // WebSocket or fire setState on an unmounted component.
  useEffect(() => {
    return () => {
      agentRef.current?.disconnect()
      agentRef.current = null
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  return { state, toast, indicatorRef, start, toggleMute, end }
}
