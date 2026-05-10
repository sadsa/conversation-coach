'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { connect } from '@/lib/voice-agent'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'
import type { TargetLanguage, TranscriptTurn } from '@/lib/types'
import type { VoiceAgent } from '@/lib/voice-agent'

type PracticeState = 'idle' | 'connecting' | 'active' | 'warning' | 'ending' | 'analysing' | 'error'

interface Props {
  targetLanguage: TargetLanguage
}

const WARN_SECONDS = 240  // 4 minutes
const END_SECONDS = 300   // 5 minutes

export function PracticeClient({ targetLanguage }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const [practiceState, setPracticeState] = useState<PracticeState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  const agentRef = useRef<VoiceAgent | null>(null)
  const turnsRef = useRef<TranscriptTurn[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = useRef(true)
  // Break circular dependency: startTimer → endSession → startTimer
  const endSessionRef = useRef<() => void>(() => {})

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      agentRef.current?.disconnect()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Block voice coach trigger while practice is active
  useEffect(() => {
    if (practiceState !== 'idle') {
      document.body.dataset.practiceActive = 'true'
    } else {
      delete document.body.dataset.practiceActive
    }
    return () => { delete document.body.dataset.practiceActive }
  }, [practiceState])

  // Warn on browser navigation during analysing
  useEffect(() => {
    if (practiceState !== 'analysing') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [practiceState])

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const startTimer = useCallback(() => {
    let count = 0
    timerRef.current = setInterval(() => {
      count++
      if (!isMountedRef.current) return
      setElapsed(count)
      if (count === WARN_SECONDS) {
        setPracticeState('warning')
        setToast(t('practice.warningToast'))
      }
      if (count >= END_SECONDS) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        endSessionRef.current()
      }
    }, 1000)
  }, [t])

  const submitTurns = useCallback(async (turns: TranscriptTurn[]) => {
    const userTurns = turns.filter(turn => turn.role === 'user')
    if (userTurns.length === 0) {
      setToast(t('practice.errorNoSpeech'))
      setPracticeState('idle')
      return
    }
    setPracticeState('analysing')
    try {
      const res = await fetch('/api/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns, targetLanguage }),
      })
      if (!res.ok) throw new Error('Analysis failed')
      const { session_id } = await res.json() as { session_id: string }
      if (isMountedRef.current) router.push(`/sessions/${session_id}`)
    } catch {
      if (isMountedRef.current) {
        setPracticeState('error')
      }
    }
  }, [t, targetLanguage, router])

  const endSession = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    agentRef.current?.disconnect()
    agentRef.current = null
    const frozenTurns = [...turnsRef.current]
    submitTurns(frozenTurns)
  }, [submitTurns])

  // Keep the ref current so startTimer can call it without a stale closure
  useEffect(() => {
    endSessionRef.current = endSession
  }, [endSession])

  const start = useCallback(async () => {
    if (practiceState !== 'idle') return
    setPracticeState('connecting')
    turnsRef.current = []
    try {
      const agent = await connect(
        targetLanguage,
        {
          onStateChange: (s) => {
            if (!isMountedRef.current) return
            if (s === 'active') {
              setPracticeState('active')
              startTimer()
            } else if (s === 'ended') {
              if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
              agentRef.current = null
            }
          },
          onError: (msg) => {
            if (!isMountedRef.current) return
            const isMicError = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
            setToast(isMicError ? t('practice.errorMic') : t('practice.errorConnect'))
            setPracticeState('idle')
          },
          onTranscript: (role, text) => {
            if (!isMountedRef.current) return
            turnsRef.current.push({ role, text, wallMs: Date.now() })
          },
        },
        { kind: 'other' },
        undefined,
        { transcription: true },
      )
      agentRef.current = agent
    } catch (err) {
      if (!isMountedRef.current) return
      const isPermission = err instanceof DOMException && err.name === 'NotAllowedError'
      setToast(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
      setPracticeState('idle')
    }
  }, [practiceState, targetLanguage, t, startTimer])

  if (practiceState === 'idle') {
    return (
      <main id="main-content" className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-6 text-center">
        <div className="flex flex-col gap-2 max-w-sm">
          <h1 className="text-xl font-semibold text-foreground">{t('nav.practice')}</h1>
          <p className="text-text-secondary text-sm">{t('practice.description')}</p>
          <p className="text-text-tertiary text-xs">{t('practice.timeLimit')}</p>
        </div>
        {toast && <Toast message={toast} />}
        <Button onClick={start}>{t('practice.start')}</Button>
      </main>
    )
  }

  if (practiceState === 'connecting') {
    return (
      <main id="main-content" className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-4">
        <Icon name="spinner" className="w-8 h-8 text-accent-primary" />
      </main>
    )
  }

  if (practiceState === 'analysing') {
    return (
      <main id="main-content" className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-4 text-center">
        <Icon name="spinner" className="w-8 h-8 text-accent-primary" />
        <p className="text-text-secondary text-sm">{t('practice.analysing')}</p>
      </main>
    )
  }

  if (practiceState === 'error') {
    return (
      <main id="main-content" className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-4 text-center">
        <p className="text-text-secondary text-sm">{t('practice.errorAnalysis')}</p>
        <Button onClick={() => submitTurns([...turnsRef.current])}>{t('practice.tryAgain')}</Button>
      </main>
    )
  }

  // active | warning | ending
  return (
    <main id="main-content" className="flex flex-col items-center min-h-[70vh] px-6 pt-12 gap-8">
      <div
        className="text-4xl font-mono tabular-nums text-foreground"
        aria-label={t('practice.timerAria', { time: formatTime(elapsed) })}
        aria-live="off"
      >
        {formatTime(elapsed)}
      </div>
      <div className="flex items-center gap-1">
        <Icon name="waveform" className="w-6 h-6 text-accent-primary" />
      </div>
      <Button variant="secondary" onClick={endSession}>
        {t('practice.end')}
      </Button>
      {toast && (
        <Toast message={toast} />
      )}
    </main>
  )
}
