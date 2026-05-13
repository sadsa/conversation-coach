'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useVoiceController, type VoiceController, type TranscriptConfig } from '@/components/VoiceController'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'
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
  saveError: boolean
  saveErrorKey: number
  clearSaveError: () => void
}

export function useVoiceSave(): VoiceSaveController {
  const router = useRouter()
  const { targetLanguage } = useTranslation()
  const [reviewState, setReviewState] = useState<ReviewState>('idle')
  const [durationSecs, setDurationSecs] = useState(0)
  const [discardToast, setDiscardToast] = useState<{ key: number } | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [saveErrorKey, setSaveErrorKey] = useState(0)

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

  useEffect(() => {
    if (reviewState !== 'analysing') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [reviewState])

  const save = useCallback(async () => {
    setSaveError(false)
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
      if (isMountedRef.current) {
        setReviewState('error')
        setSaveError(true)
        setSaveErrorKey(k => k + 1)
      }
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
    saveError,
    saveErrorKey,
    clearSaveError: () => setSaveError(false),
  }
}

interface VoiceReviewStripProps {
  open: boolean
  durationSecs: number
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  onResume: () => void
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Mobile-only fixed bottom strip that replaces the bottom nav during the
// save-prompt review state. Same visual language as VoiceWaveMode — bg-surface
// with a top border — but taller to accommodate two rows of content:
//   Row 1: heading + elapsed duration
//   Row 2: Resume (text link), Discard (ghost pill), Save (accent pill)
//
// --voice-bottom-height is managed by ConditionalNav (not here) so there
// is no race with VoiceWaveMode's cleanup removing the variable.
export function VoiceReviewStrip({
  open,
  durationSecs,
  saving,
  onSave,
  onDiscard,
  onResume,
}: VoiceReviewStripProps) {
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevOpen = useRef(false)

  useEffect(() => {
    if (open && !prevOpen.current) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setExiting(false)
      setMounted(true)
    } else if (!open && prevOpen.current) {
      setExiting(true)
      timerRef.current = setTimeout(() => {
        setMounted(false)
        setExiting(false)
        timerRef.current = null
      }, 280)
    }
    prevOpen.current = open
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [open])

  if (!mounted) return null

  return (
    <div
      role="region"
      aria-label={t('voiceSave.heading')}
      className={`md:hidden fixed left-0 right-0 bottom-0 z-40 ${exiting ? 'voice-wave-exit' : 'voice-wave-anim'}`}
      style={{ height: 'calc(7rem + env(safe-area-inset-bottom))' }}
    >
      {/* Opaque surface — covers bottom nav tabs beneath */}
      <div aria-hidden className="absolute inset-0 bg-surface border-t border-border-subtle" />

      {/* Content — two rows stacked vertically */}
      <div
        className="absolute left-0 right-0 bottom-0 px-5 flex flex-col justify-center gap-2"
        style={{
          height: 'calc(7rem + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Row 1: heading + duration */}
        <div>
          <p className="text-sm font-semibold text-foreground">{t('voiceSave.heading')}</p>
          <p className="text-xs text-text-tertiary tabular-nums mt-0.5">{formatDuration(durationSecs)}</p>
        </div>

        {/* Row 2: Resume (left), Discard + Save (right) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResume}
            disabled={saving}
            className="min-h-[44px] flex items-center min-w-0 whitespace-nowrap text-xs text-text-tertiary hover:text-text-secondary transition-colors select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50"
          >
            {t('voiceSave.resume')}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="min-h-[44px] px-4 flex items-center flex-shrink-0 rounded-full text-xs font-medium text-text-secondary bg-surface-elevated hover:bg-text-tertiary/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50"
          >
            {t('voiceSave.discard')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-h-[44px] px-4 flex items-center flex-shrink-0 gap-1.5 whitespace-nowrap rounded-full text-xs font-semibold text-on-accent bg-accent-primary hover:bg-accent-primary-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50"
          >
            {saving ? (
              <>
                <Icon name="spinner" className="w-3 h-3" />
                {t('practice.analysing')}
              </>
            ) : (
              t('voiceSave.save')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
