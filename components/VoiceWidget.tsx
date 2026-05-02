// components/VoiceWidget.tsx
//
// Floating voice-coach widget. Renders a mic bubble (idle), connecting spinner,
// or an expanded control pill (active/muted) anchored above the bottom nav.
// Hides entirely when there are no unwritten practice items to discuss.
'use client'
import { useState, useRef, useCallback } from 'react'
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
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const agentRef = useRef<VoiceAgent | null>(null)
  const toastKeyRef = useRef(0)

  const items = initialItems
  const focusedItem = items[focusedIndex] ?? items[0]

  const showToast = useCallback((message: string) => {
    toastKeyRef.current += 1
    setToast(message)
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handleStart = useCallback(async () => {
    if (widgetState !== 'idle' || !focusedItem) return
    setWidgetState('connecting')

    try {
      const agent = await connect(
        targetLanguage,
        items.map(toFocusedCorrection),
        toFocusedCorrection(focusedItem),
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
        }
      )
      agentRef.current = agent
    } catch {
      setWidgetState('idle')
      showToast(t('voice.micPermission'))
    }
  }, [widgetState, focusedItem, items, targetLanguage, t, showToast])

  const handleEnd = useCallback(() => {
    agentRef.current?.disconnect()
    agentRef.current = null
    setWidgetState('idle')
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

  const handlePrev = useCallback(() => {
    if (!agentRef.current || focusedIndex === 0) return
    const nextIndex = focusedIndex - 1
    setFocusedIndex(nextIndex)
    const nextItem = items[nextIndex]
    if (nextItem) {
      agentRef.current.updateFocus(
        toFocusedCorrection(nextItem),
        items.map(toFocusedCorrection),
        targetLanguage
      )
    }
  }, [focusedIndex, items, targetLanguage])

  const handleNext = useCallback(() => {
    if (!agentRef.current || focusedIndex === items.length - 1) return
    const nextIndex = focusedIndex + 1
    setFocusedIndex(nextIndex)
    const nextItem = items[nextIndex]
    if (nextItem) {
      agentRef.current.updateFocus(
        toFocusedCorrection(nextItem),
        items.map(toFocusedCorrection),
        targetLanguage
      )
    }
  }, [focusedIndex, items, targetLanguage])

  // Hide entirely when nothing to discuss.
  if (items.length === 0) return null

  const isActive = widgetState === 'active' || widgetState === 'muted'
  const isMuted = widgetState === 'muted'
  const isConnecting = widgetState === 'connecting'

  return (
    <>
      {/* Idle: floating mic bubble, bottom-left above bottom nav */}
      {!isActive && !isConnecting && (
        <button
          type="button"
          onClick={handleStart}
          aria-label={t('voice.startAria')}
          className="
            fixed left-4 z-40
            w-12 h-12 rounded-full
            bg-accent-primary text-white shadow-lg
            flex items-center justify-center
            hover:bg-accent-primary-hover active:scale-95
            transition-transform
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 12px)' }}
        >
          <Icon name="mic" className="w-5 h-5" />
        </button>
      )}

      {/* Connecting spinner in same position */}
      {isConnecting && (
        <div
          className="fixed left-4 z-40 w-12 h-12 rounded-full bg-accent-primary text-white shadow-lg flex items-center justify-center"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 12px)' }}
          aria-label={t('voice.connecting')}
        >
          <Icon name="spinner" className="w-5 h-5" />
        </div>
      )}

      {/* Active: context label + control pill, centred above bottom nav */}
      {isActive && focusedItem && (
        <div
          className="fixed left-0 right-0 z-40 flex flex-col items-center gap-2 px-3"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 10px)' }}
        >
          {/* Context label */}
          <div className="bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-xs text-text-secondary max-w-xs truncate">
            <span className="text-accent-primary font-medium mr-2 tabular-nums">
              {t('voice.focus', { n: focusedIndex + 1, total: items.length })}
            </span>
            <s className="text-status-error">{focusedItem.original}</s>
            <span className="mx-1 text-text-tertiary">→</span>
            <span className="text-text-primary">{focusedItem.correction ?? focusedItem.original}</span>
          </div>

          {/* Control pill */}
          <div className="
            bg-[rgba(15,23,42,0.88)] backdrop-blur-md
            border border-white/10 rounded-full
            px-5 py-2.5
            flex items-center gap-5
            shadow-xl
          ">
            {/* Prev */}
            <button
              type="button"
              onClick={handlePrev}
              disabled={focusedIndex === 0}
              aria-label={t('voice.prevAria')}
              className="text-white/70 hover:text-white disabled:opacity-30 transition-opacity"
            >
              <Icon name="chevron-left" className="w-5 h-5" />
            </button>

            {/* Next */}
            <button
              type="button"
              onClick={handleNext}
              disabled={focusedIndex === items.length - 1}
              aria-label={t('voice.nextAria')}
              className="text-white/70 hover:text-white disabled:opacity-30 transition-opacity"
            >
              <Icon name="chevron-right" className="w-5 h-5" />
            </button>

            {/* Mic / active indicator (larger, centred) */}
            <div
              className={`
                w-11 h-11 rounded-full flex items-center justify-center shadow-md
                ${isMuted ? 'bg-red-500 shadow-red-500/25' : 'bg-accent-primary shadow-accent-primary/25'}
              `}
            >
              <Icon name={isMuted ? 'mic-off' : 'mic'} className="w-5 h-5 text-white" />
            </div>

            {/* Mute toggle */}
            <button
              type="button"
              onClick={handleMute}
              aria-label={isMuted ? t('voice.unmuteAria') : t('voice.muteAria')}
              aria-pressed={isMuted}
              className="text-white/70 hover:text-white transition-opacity"
            >
              <Icon name={isMuted ? 'mic' : 'mic-off'} className="w-5 h-5" />
            </button>

            {/* End */}
            <button
              type="button"
              onClick={handleEnd}
              aria-label={t('voice.endAria')}
              className="text-white/70 hover:text-white transition-opacity"
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
