// components/TranscriptView.tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { AnnotatedText } from '@/components/AnnotatedText'
import { AnnotationSheet } from '@/components/AnnotationSheet'
import { useTranslation } from '@/components/LanguageProvider'
import type { TranscriptSegment, Annotation } from '@/lib/types'

// One-shot localStorage flag: once the user has actually opened an
// annotation in this session (clicked any mark), we treat the legend as
// "learned" and stop rendering it on future sessions. Bumping the suffix
// here will re-show it for everyone if the colour states ever change.
const LEGEND_LEARNED_KEY = 'cc:transcript-legend.learned.v1'

interface Props {
  segments: TranscriptSegment[]
  annotations: Annotation[]
  userSpeakerLabels: ('A' | 'B')[] | null
  audioUrl: string | null
  sessionId: string
  addedAnnotations: Map<string, string>
  writtenAnnotations: Set<string>
  unhelpfulAnnotations: Set<string>
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
  onAnnotationWritten: (annotationId: string) => void
  onAnnotationUnwritten: (annotationId: string) => void
  onAnnotationUnhelpfulChanged: (annotationId: string, isUnhelpful: boolean) => void
}

export function TranscriptView({
  segments, annotations, userSpeakerLabels, audioUrl, sessionId,
  addedAnnotations, writtenAnnotations, unhelpfulAnnotations,
  onAnnotationAdded, onAnnotationRemoved, onAnnotationWritten, onAnnotationUnwritten,
  onAnnotationUnhelpfulChanged,
}: Props) {
  const { t } = useTranslation()
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  // Legend visibility — true on first paint for first-time users, false
  // forever after the user has opened any annotation. Lives in local state
  // because we need to react to the user's first click within the session
  // even if localStorage already says "learned".
  const [legendVisible, setLegendVisible] = useState(true)

  // On mount, hide the legend immediately for returning users so it never
  // flashes. SSR-safe — no localStorage access during render.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (window.localStorage.getItem(LEGEND_LEARNED_KEY)) setLegendVisible(false)
    } catch {
      // localStorage can throw in private mode; safer to keep showing the
      // legend than to swallow it.
    }
  }, [])

  const annotationsBySegment = annotations.reduce<Record<string, Annotation[]>>((acc, a) => {
    if (!acc[a.segment_id]) acc[a.segment_id] = []
    acc[a.segment_id].push(a)
    return acc
  }, {})

  const savedAnnotationIds = useMemo(() => new Set(addedAnnotations.keys()), [addedAnnotations])

  /**
   * Flat ordered list of annotations on user-attributable segments, used to
   * compute prev/next for the AnnotationSheet.
   */
  const orderedAnnotations = useMemo<Annotation[]>(() => {
    return segments.flatMap(seg => {
      const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)
      if (!isUser) return []
      const segAnns = annotationsBySegment[seg.id] ?? []
      return [...segAnns].sort((a, b) => a.start_char - b.start_char)
    })
  }, [segments, userSpeakerLabels, annotationsBySegment])

  const activeIndex = activeAnnotationId
    ? orderedAnnotations.findIndex(a => a.id === activeAnnotationId)
    : -1
  const activeAnnotation = activeIndex >= 0 ? orderedAnnotations[activeIndex] : null

  function handleClick(a: Annotation) {
    setActiveAnnotationId(prev => (prev === a.id ? null : a.id))
    // First time the user actually engages with a mark, retire the legend
    // — they've now demonstrated they understand the affordance, and the
    // coloured swatches above the transcript are pure chrome from here on.
    if (legendVisible) {
      setLegendVisible(false)
      try {
        window.localStorage.setItem(LEGEND_LEARNED_KEY, '1')
      } catch {
        // Same as the read above — best effort, not load-bearing.
      }
    }
  }

  function handlePrev() {
    if (activeIndex > 0) setActiveAnnotationId(orderedAnnotations[activeIndex - 1].id)
  }

  function handleNext() {
    if (activeIndex >= 0 && activeIndex < orderedAnnotations.length - 1) {
      setActiveAnnotationId(orderedAnnotations[activeIndex + 1].id)
    }
  }

  // When the active annotation changes, scroll the corresponding mark into a
  // visible band so the user keeps their place. On mobile the sheet covers
  // the bottom ~55%, so we aim for the upper third. On desktop the sheet is
  // a side panel and the mark only needs to be in the viewport.
  useEffect(() => {
    if (!activeAnnotationId) return
    if (typeof window === 'undefined') return
    const el = document.querySelector(`[data-annotation-id="${activeAnnotationId}"]`)
    if (!(el instanceof HTMLElement)) return
    // matchMedia is unavailable in some test environments; default to mobile
    // layout + reduced motion if missing.
    const reduced = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : true
    const isWide = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 768px)').matches
      : false
    const rect = el.getBoundingClientRect()
    const targetY = isWide ? window.innerHeight * 0.4 : window.innerHeight * 0.25
    const delta = rect.top - targetY
    if (Math.abs(delta) < 8) return
    if (typeof window.scrollBy === 'function') {
      window.scrollBy({ top: delta, behavior: reduced ? 'auto' : 'smooth' })
    }
  }, [activeAnnotationId])

  const userLabel = t('transcript.you')
  const themLabel = t('transcript.them')

  return (
    <div>
      {/* Inline legend — first-time onboarding only. Hides itself the moment
          the user opens any annotation (and remembers across sessions via
          localStorage). The swatches now carry a non-colour secondary signal
          — a tiny mark glyph that mirrors how the mark itself is rendered in
          the transcript — so colour-blind users have a working signal too. */}
      {annotations.length > 0 && legendVisible && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary mb-5">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="annotation-unreviewed inline-flex items-center justify-center w-5 h-4 rounded-sm font-medium text-[10px] leading-none"
            >
              Aa
            </span>
            {t('transcript.legend.amber')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="annotation-saved inline-flex items-center justify-center w-5 h-4 rounded-sm font-medium text-[10px] leading-none underline decoration-2 underline-offset-2"
            >
              Aa
            </span>
            {t('transcript.legend.violet')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="annotation-written inline-flex items-center justify-center w-5 h-4 rounded-sm font-medium text-[10px] leading-none"
            >
              ✓
            </span>
            {t('transcript.legend.green')}
          </span>
        </div>
      )}

      <div
        className="space-y-6 max-w-prose"
        // Bottom padding makes room for the docked sheet on mobile so the
        // last few turns can scroll above it. Removed automatically when
        // the sheet closes.
        style={activeAnnotationId ? { paddingBottom: '60vh' } : undefined}
      >
        {segments.map(seg => {
          const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)
          return (
            <div key={seg.id}>
              <div
                className={!isUser ? 'opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity' : ''}
                data-speaker-role={isUser ? 'user' : 'partner'}
              >
                <p className="text-xs text-text-tertiary uppercase tracking-wide mb-1.5 font-medium">
                  {isUser ? userLabel : themLabel}
                </p>
                <span className="text-base md:text-lg leading-loose break-words text-text-primary">
                  {isUser && (annotationsBySegment[seg.id] ?? []).length > 0 ? (
                    <AnnotatedText
                      text={seg.text}
                      annotations={annotationsBySegment[seg.id] ?? []}
                      onAnnotationClick={handleClick}
                      savedAnnotationIds={savedAnnotationIds}
                      writtenAnnotationIds={writtenAnnotations}
                      unhelpfulAnnotationIds={unhelpfulAnnotations}
                      activeAnnotationId={activeAnnotationId}
                      openLabel={t('transcript.openCorrection')}
                      stateLabels={{
                        written: t('transcript.markState.written'),
                        saved: t('transcript.markState.saved'),
                        unreviewed: t('transcript.markState.unreviewed'),
                      }}
                    />
                  ) : (
                    seg.text
                  )}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <AnnotationSheet
        annotation={
          activeAnnotation
            ? { ...activeAnnotation, is_unhelpful: unhelpfulAnnotations.has(activeAnnotation.id) }
            : null
        }
        segment={activeAnnotation ? segments.find(s => s.id === activeAnnotation.segment_id) ?? null : null}
        audioUrl={audioUrl}
        position={activeAnnotation ? { current: activeIndex + 1, total: orderedAnnotations.length } : null}
        hasPrev={activeIndex > 0}
        hasNext={activeIndex >= 0 && activeIndex < orderedAnnotations.length - 1}
        onClose={() => setActiveAnnotationId(null)}
        onPrev={handlePrev}
        onNext={handleNext}
        sessionId={sessionId}
        practiceItemId={activeAnnotation ? (addedAnnotations.get(activeAnnotation.id) ?? null) : null}
        isWrittenDown={activeAnnotation ? writtenAnnotations.has(activeAnnotation.id) : false}
        onAnnotationAdded={onAnnotationAdded}
        onAnnotationRemoved={onAnnotationRemoved}
        onAnnotationWritten={onAnnotationWritten}
        onAnnotationUnwritten={onAnnotationUnwritten}
        onAnnotationUnhelpfulChanged={onAnnotationUnhelpfulChanged}
      />
    </div>
  )
}
