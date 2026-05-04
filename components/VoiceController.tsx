// components/VoiceController.tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { connect } from '@/lib/voice-agent'
import type { VoiceAgent, VoiceAgentState, VoiceRouteContext } from '@/lib/voice-agent'
import type { VoicePageContext } from '@/lib/voice-context'

const RMS_DECAY = 0.85
const RMS_FLOOR = 0.004
const SCALE_GAIN = 5
const SCALE_MAX = 0.45

export type VoiceControllerState = 'idle' | 'connecting' | 'active' | 'muted'

export interface VoiceToast {
  message: string
  retryable?: boolean
}

export interface VoiceController {
  state: VoiceControllerState
  toast: VoiceToast | null
  toastKey: number
  indicatorRef: React.RefObject<HTMLDivElement>
  start: () => void
  toggleMute: () => void
  end: () => void
}

function deriveRouteContext(pathname: string | null, voiceContext?: VoicePageContext): VoiceRouteContext {
  if (!pathname) return { kind: 'other' }
  if (pathname.startsWith('/write')) return { kind: 'write' }
  if (pathname.startsWith('/sessions/') && voiceContext?.kind === 'session') {
    return { kind: 'session', sessionTitle: voiceContext.sessionTitle }
  }
  return { kind: 'other' }
}

export function useVoiceController(): VoiceController {
  const { t, targetLanguage } = useTranslation()
  const pathname = usePathname()
  const [state, setState] = useState<VoiceControllerState>('idle')
  const [toast, setToast] = useState<VoiceToast | null>(null)
  const [toastKey, setToastKey] = useState(0)

  const agentRef = useRef<VoiceAgent | null>(null)
  const userRmsRef = useRef(0)
  const agentRmsRef = useRef(0)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)
  const startingRef = useRef(false)

  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  const showToast = useCallback((message: string, retryable: boolean = false) => {
    if (!isMountedRef.current) return
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ message, retryable })
    setToastKey(k => k + 1)
    toastTimerRef.current = window.setTimeout(() => {
      if (!isMountedRef.current) return
      setToast(null)
      toastTimerRef.current = null
    }, retryable ? 8000 : 4000)
  }, [])

  const start = useCallback(async () => {
    if (startingRef.current || state !== 'idle') return
    startingRef.current = true
    setState('connecting')

    // Read page context once at connect time — pinned for the session lifetime.
    const pageContext = typeof window !== 'undefined' ? window.__ccVoiceContext : undefined
    const routeContext = deriveRouteContext(pathname, pageContext)

    try {
      const agent = await connect(
        targetLanguage,
        {
          onStateChange: (s: VoiceAgentState) => {
            if (!isMountedRef.current) return
            if (s === 'active') setState('active')
            else if (s === 'ended') {
              setState('idle')
              agentRef.current = null
            }
          },
          onError: (message: string) => {
            if (!isMountedRef.current) return
            setState('idle')
            agentRef.current = null
            if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
              showToast(tRef.current('voice.micPermission'))
            } else {
              showToast(tRef.current('voice.sessionEnded'), true)
            }
          },
          onUserAudio: (rms) => { userRmsRef.current = Math.max(userRmsRef.current, rms) },
          onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
        },
        routeContext,
        pageContext
      )
      if (!isMountedRef.current) {
        agent.disconnect()
        return
      }
      agentRef.current = agent
    } catch (err) {
      if (!isMountedRef.current) return
      setState('idle')
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
        showToast(tRef.current('voice.micPermission'))
      } else {
        showToast(tRef.current('voice.sessionEnded'), true)
      }
    } finally {
      startingRef.current = false
    }
  }, [state, targetLanguage, pathname, showToast])

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

  const endRef = useRef(end)
  const toggleMuteRef = useRef(toggleMute)
  useEffect(() => { endRef.current = end }, [end])
  useEffect(() => { toggleMuteRef.current = toggleMute }, [toggleMute])

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
        endRef.current()
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        toggleMuteRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

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

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      agentRef.current?.disconnect()
      agentRef.current = null
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  return { state, toast, toastKey, indicatorRef, start, toggleMute, end }
}
