'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useVoiceController, type VoiceController, type TranscriptConfig } from '@/components/VoiceController'
import { useTranslation } from '@/components/LanguageProvider'
import type { TranscriptTurn, TargetLanguage } from '@/lib/types'

export type ReviewState = 'idle' | 'review' | 'analysing' | 'error'

export interface VoiceSaveController extends VoiceController {
  reviewState: ReviewState
  durationSecs: number
  save: () => Promise<void>
  discard: () => void
  undoDiscard: () => void
  resume: () => void
  discardToast: { key: number } | null
}

export function useVoiceSave(): VoiceSaveController {
  const router = useRouter()
  const { targetLanguage } = useTranslation()
  const [reviewState, setReviewState] = useState<ReviewState>('idle')
  const [durationSecs, setDurationSecs] = useState(0)
  const [discardToast, setDiscardToast] = useState<{ key: number } | null>(null)

  const turnsRef = useRef<TranscriptTurn[]>([])
  const frozenTurnsRef = useRef<TranscriptTurn[]>([])
  const startedAtMsRef = useRef<number | null>(null)
  const prevControllerStateRef = useRef<VoiceController['state']>('idle')
  const discardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  // Stable ref so save() always reads the latest targetLanguage without
  // being listed as a dep (avoids re-creating the callback on lang change).
  const targetLanguageRef = useRef<TargetLanguage>(targetLanguage)
  useEffect(() => { targetLanguageRef.current = targetLanguage }, [targetLanguage])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (discardTimerRef.current) clearTimeout(discardTimerRef.current)
    }
  }, [])

  // useMemo keeps the transcriptConfig object reference stable across renders
  // so useVoiceController's internal dep array doesn't fire on every render.
  // The onTurn callback is stable because turnsRef never changes identity.
  const transcriptConfig: TranscriptConfig = useMemo(() => ({
    onTurn: (role: 'user' | 'model', text: string) => {
      turnsRef.current.push({ role, text, wallMs: Date.now() })
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const controller = useVoiceController(transcriptConfig)

  // Detect session start and end transitions.
  useEffect(() => {
    const prev = prevControllerStateRef.current
    const curr = controller.state
    prevControllerStateRef.current = curr

    if (curr === 'active' && prev !== 'active' && prev !== 'muted') {
      startedAtMsRef.current = Date.now()
    }

    if ((prev === 'active' || prev === 'muted') && curr === 'idle') {
      const turns = turnsRef.current
      const hasUserTurns = turns.some(t => t.role === 'user')
      if (hasUserTurns) {
        frozenTurnsRef.current = [...turns]
        const elapsed = startedAtMsRef.current
          ? Math.round((Date.now() - startedAtMsRef.current) / 1000)
          : 0
        setDurationSecs(elapsed)
        setReviewState('review')
      }
      turnsRef.current = []
      startedAtMsRef.current = null
    }
  }, [controller.state])

  const save = useCallback(async () => {
    setReviewState('analysing')
    try {
      const res = await fetch('/api/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns: frozenTurnsRef.current,
          targetLanguage: targetLanguageRef.current,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      const { session_id } = await res.json() as { session_id: string }
      if (isMountedRef.current) router.push(`/sessions/${session_id}`)
    } catch {
      if (isMountedRef.current) setReviewState('error')
    }
  }, [router])

  const discard = useCallback(() => {
    if (discardTimerRef.current) clearTimeout(discardTimerRef.current)
    setDiscardToast({ key: Date.now() })
    setReviewState('idle')
    discardTimerRef.current = setTimeout(() => {
      discardTimerRef.current = null
      frozenTurnsRef.current = []
      if (isMountedRef.current) setDiscardToast(null)
    }, 5000)
  }, [])

  const undoDiscard = useCallback(() => {
    if (discardTimerRef.current) {
      clearTimeout(discardTimerRef.current)
      discardTimerRef.current = null
    }
    setDiscardToast(null)
    setReviewState('review')
  }, [])

  const resume = useCallback(() => {
    turnsRef.current = [...frozenTurnsRef.current]
    setReviewState('idle')
    controller.start()
  }, [controller.start])

  return {
    ...controller,
    reviewState,
    durationSecs,
    save,
    discard,
    undoDiscard,
    resume,
    discardToast,
  }
}
