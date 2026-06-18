// components/TranscriptView.tsx
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AnnotatedText } from '@/components/AnnotatedText'
import { AnnotationSheet } from '@/components/AnnotationSheet'
import { StudyPrompt } from '@/components/StudyPrompt'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'
import { log } from '@/lib/logger'
import type { TranscriptSegment, Annotation } from '@/lib/types'

/** Pure helper: split a segment's text on paragraph_breaks offsets into
 *  blocks each carrying their starting offset for annotation rebasing.
 *  splitIntoParagraphs(text, []) === [{ text, offset: 0 }] — i.e. legacy
 *  single-block render. */
function splitIntoParagraphs(text: string, breaks: number[]): Array<{ text: string; offset: number }> {
  const bounds = [0, ...breaks, text.length]
  return bounds.slice(0, -1).map((start, i) => ({
    text: text.slice(start, bounds[i + 1]),
    offset: start,
  }))
}

// One-shot localStorage flag: once the user has actually opened an
// annotation in this session (clicked any mark), we treat the legend as
// "learned" and stop rendering it on future sessions. Bumping the suffix
// here will re-show it for everyone if the colour states ever change.
const LEGEND_LEARNED_KEY = 'cc:transcript-legend.learned.v1'

interface Props {
  segments: TranscriptSegment[]
  annotations: Annotation[]
  userSpeakerLabels: ('A' | 'B')[] | null
  sessionId: string
  addedAnnotations: Map<string, string>
  unhelpfulAnnotations: Set<string>
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
  onAnnotationUnhelpfulChanged: (annotationId: string, isUnhelpful: boolean) => void
  /**
   * Launches the in-place Study session. When provided, the "Study N saved"
   * pill renders here (alongside the other bottom cues) so it shares their
   * sheet-open gate — otherwise it would float at z-50 over the open sheet's
   * action buttons.
   */
  onLaunchStudy?: () => void
}

export function TranscriptView({
  segments, annotations, userSpeakerLabels, sessionId,
  addedAnnotations, unhelpfulAnnotations,
  onAnnotationAdded, onAnnotationRemoved,
  onAnnotationUnhelpfulChanged,
  onLaunchStudy,
}: Props) {
  const { t } = useTranslation()
  const prefersReducedMotion = useReducedMotion()
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  // Legend visibility — true on first paint for first-time users, false
  // forever after the user has opened any annotation. Lives in local state
  // because we need to react to the user's first click within the session
  // even if localStorage already says "learned".
  const [legendVisible, setLegendVisible] = useState(true)
  // Pill: true when the last annotation is still below the fold (not yet
  // scrolled into view). Starts false — pill shows only after settle delay.
  const [hasAnnotationBelowFold, setHasAnnotationBelowFold] = useState(false)
  // Delayed gate: pill shouldn't snap into view before the page has settled.
  const [pillReady, setPillReady] = useState(false)
  const pillObserverRef = useRef<IntersectionObserver | null>(null)

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

  const lastAnnotationId = orderedAnnotations[orderedAnnotations.length - 1]?.id ?? null

  // Show the pill after a short settle delay — avoids it flashing on arrival
  // before the user has had a chance to read the page header.
  useEffect(() => {
    if (!lastAnnotationId) return
    const timer = setTimeout(() => setPillReady(true), 500)
    return () => clearTimeout(timer)
  }, [lastAnnotationId])

  // Track whether any correction remains below the fold by observing the last
  // annotation. Pill shows when the last annotation is below the viewport;
  // hides once it's in view or has already scrolled above.
  useEffect(() => {
    if (!lastAnnotationId || typeof window === 'undefined') return
    const rafId = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-annotation-id="${lastAnnotationId}"]`)
      if (!(el instanceof Element)) return
      pillObserverRef.current?.disconnect()
      const observer = new IntersectionObserver(
        ([entry]) => {
          // isIntersecting covers "in viewport"; boundingClientRect.top <= 0
          // covers "scrolled above" — both mean no corrections remain below.
          const belowFold = !entry.isIntersecting && entry.boundingClientRect.top > 0
          setHasAnnotationBelowFold(belowFold)
        },
        { threshold: 0 }
      )
      observer.observe(el)
      pillObserverRef.current = observer
    })
    return () => {
      cancelAnimationFrame(rafId)
      pillObserverRef.current?.disconnect()
      pillObserverRef.current = null
    }
  }, [lastAnnotationId])

  // Show "Next correction" cue only while a correction remains below the fold.
  // Hidden when a sheet is open.
  const showNextPill = pillReady && hasAnnotationBelowFold && !activeAnnotationId

  // Whether the Study pill is occupying the bottom toast slot. It mirrors
  // StudyPrompt's own visibility gate (count > 0, no sheet open). The
  // transient cues below default to `--toast-bottom` too, so when the Study
  // pill is up they'd stack on the exact same anchor (on mobile
  // `--toast-bottom` === `5rem + safe-area`) and the z-50 Study pill would
  // paint over the z-40 cue — raise the cue above it instead.
  const studyPillShown = !!onLaunchStudy && !activeAnnotationId && addedAnnotations.size > 0
  const cueBottom = studyPillShown
    ? 'calc(var(--toast-bottom) + 4.5rem)'
    : 'calc(5rem + env(safe-area-inset-bottom))'

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

  function handleScrollToNextBelow() {
    if (typeof window === 'undefined') return
    const els = Array.from(document.querySelectorAll('[data-annotation-id]'))
    // Find the annotation element closest below the viewport bottom.
    const below = els
      .map(el => ({ el, top: el.getBoundingClientRect().top }))
      .filter(({ top }) => top > window.innerHeight)
      .sort((a, b) => a.top - b.top)[0]
    if (!below) return
    const reduced = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : true
    const isWide = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 768px)').matches
      : false
    const targetY = isWide ? window.innerHeight * 0.4 : window.innerHeight * 0.25
    const delta = below.top - targetY
    if (typeof window.scrollBy === 'function') {
      window.scrollBy({ top: delta, behavior: reduced ? 'auto' : 'smooth' })
    }
  }

  // Dismiss the sheet after saving. The user re-opens the sheet by tapping
  // another annotation mark.
  function handleAnnotationSaved(annotationId: string, practiceItemId: string) {
    onAnnotationAdded(annotationId, practiceItemId)
    setActiveAnnotationId(null)
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

  // Bubble layout (mirrors the live Talk-mode view) kicks in for any
  // conversation with two or more distinct speakers — uploads with a
  // partner, and voice-practice sessions (A = you, B = the agent). A
  // single-speaker recording (a solo voice note) keeps the document
  // layout: one-sided bubbles would waste the column and read oddly.
  const useBubbles = useMemo(
    () => new Set(segments.map(s => s.speaker)).size >= 2,
    [segments],
  )

  // Label every turn *boundary* — the first segment of each contiguous
  // same-speaker run. This re-orients the reader at each hand-off without
  // the noise of labelling literally every bubble, and without the old
  // failure mode of labelling only the first-ever turn (which leaves a long
  // back-and-forth unanchored once you've scrolled past the top). Consecutive
  // segments from the same speaker stay grouped under one label.
  const turnStartSegIds = useMemo(() => {
    const ids = new Set<string>()
    let prevIsUser: boolean | null = null
    for (const seg of segments) {
      const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)
      if (isUser !== prevIsUser) ids.add(seg.id)
      prevIsUser = isUser
    }
    return ids
  }, [segments, userSpeakerLabels])

  // Shared body renderer — turns a segment's paragraphs into <p> blocks,
  // wiring annotated user paragraphs through AnnotatedText. Used by both
  // the bubble and document layouts so the annotation behaviour is identical.
  function renderSegmentBody(
    isUser: boolean,
    paragraphs: Array<{ text: string; offset: number }>,
    segAnns: Annotation[],
  ) {
    return paragraphs.map((para, i) => {
      const paraAnns = isUser
        ? segAnns.filter(a => a.start_char >= para.offset && a.end_char <= para.offset + para.text.length)
        : []
      return (
        <p key={i}>
          {paraAnns.length > 0 ? (
            <AnnotatedText
              text={para.text}
              annotations={paraAnns}
              offsetBase={para.offset}
              onAnnotationClick={handleClick}
              savedAnnotationIds={savedAnnotationIds}
              unhelpfulAnnotationIds={unhelpfulAnnotations}
              activeAnnotationId={activeAnnotationId}
              openLabel={t('transcript.openCorrection')}
              stateLabels={{
                saved: t('transcript.markState.saved'),
                unreviewed: t('transcript.markState.unreviewed'),
              }}
            />
          ) : (
            para.text
          )}
        </p>
      )
    })
  }

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
        </div>
      )}

      <div
        className={useBubbles ? 'flex flex-col max-w-prose' : 'space-y-6 max-w-prose'}
        // Bottom clearance so the last turn never collides with a fixed
        // overlay. Sheet open → reserve 60vh for the docked sheet on mobile.
        // Otherwise, if a bottom-floating cue is up (the "see corrections"
        // pill or the Study pill, both anchored ~5rem from the bottom and
        // ~3rem tall), reserve enough that the final turn scrolls clear of
        // it — the <main> padding only covers the nav, not these cues. When
        // the cue is stacked above the Study pill it sits ~4.5rem higher, so
        // reserve extra for that combined height.
        style={
          activeAnnotationId
            ? { paddingBottom: '60vh' }
            : showNextPill
              ? { paddingBottom: studyPillShown ? '9rem' : '4rem' }
              : undefined
        }
      >
        {segments.map((seg, index) => {
          const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)
          const paragraphs = splitIntoParagraphs(seg.text, seg.paragraph_breaks)
          const segAnns = annotationsBySegment[seg.id] ?? []
          // An annotation belongs to whichever paragraph contains its start char,
          // and is rendered only when its full range fits inside that paragraph.
          // In practice Claude annotates phrases short enough that this always
          // holds (paragraph breaks land on sentence boundaries); the rare case
          // where end_char crosses a break is logged so we'd see it in production.
          if (isUser) {
            for (const a of segAnns) {
              const owningPara = paragraphs.find(p => a.start_char >= p.offset && a.start_char < p.offset + p.text.length)
              if (owningPara && a.end_char > owningPara.offset + owningPara.text.length) {
                log.warn('Annotation spans paragraph break, will not render', {
                  segmentId: seg.id, annotationId: a.id,
                })
              }
            }
          }

          // ── Bubble layout (multi-speaker) ──────────────────────────────
          // Mirrors Talk mode: user turns right, partner turns left. Speaker
          // identity is carried by three reinforcing signals — side alignment,
          // a role label at each turn boundary, and a per-role fill. YOU turns
          // sit on the lightest near-white surface, THEM turns on a recessed
          // grey. Counter to the usual "your bubble is the bright accent"
          // convention, keeping YOU on the *cleanest* surface is deliberate:
          // every annotation mark lives on a user turn, and the mark tints
          // (~94–95% L) gain real lightness contrast against near-white that
          // they'd lose against the grey. Both keep the quiet `border-subtle`
          // ring so the near-white YOU bubble still separates from the page.
          if (useBubbles) {
            const isTurnStart = turnStartSegIds.has(seg.id)
            // Tight stack within a turn, a clear gap at each hand-off. The
            // first segment overall needs no leading gap.
            const spacing = index === 0 ? '' : isTurnStart ? 'mt-5' : 'mt-1.5'
            return (
              <div
                key={seg.id}
                data-speaker-role={isUser ? 'user' : 'partner'}
                className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'} ${spacing}`}
              >
                <div
                  className={`
                    max-w-[88%] md:max-w-[80%] rounded-2xl px-4 py-3
                    text-base md:text-lg leading-[1.7] break-words text-text-primary
                    space-y-2 ring-1 ring-border-subtle
                    ${isUser ? 'bg-surface' : 'bg-surface-elevated'}
                  `}
                >
                  {renderSegmentBody(isUser, paragraphs, segAnns)}
                </div>
              </div>
            )
          }

          // ── Document layout (single speaker — e.g. a solo voice note) ───
          return (
            <div key={seg.id}>
              <div data-speaker-role={isUser ? 'user' : 'partner'}>
                <div className="space-y-3 md:space-y-4 text-base md:text-lg leading-[1.8] break-words text-text-primary">
                  {renderSegmentBody(isUser, paragraphs, segAnns)}
                </div>
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
        hasPrev={activeIndex > 0}
        hasNext={activeIndex >= 0 && activeIndex < orderedAnnotations.length - 1}
        onClose={() => setActiveAnnotationId(null)}
        onPrev={handlePrev}
        onNext={handleNext}
        sessionId={sessionId}
        practiceItemId={activeAnnotation ? (addedAnnotations.get(activeAnnotation.id) ?? null) : null}
        onAnnotationAdded={handleAnnotationSaved}
        onAnnotationRemoved={onAnnotationRemoved}
        onAnnotationUnhelpfulChanged={onAnnotationUnhelpfulChanged}
      />

      <AnimatePresence>
        {showNextPill && (
          <motion.div
            key="corrections-pill"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8, scale: prefersReducedMotion ? 1 : 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 4, scale: prefersReducedMotion ? 1 : 0.97 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.25, 1, 0.5, 1] }}
            className="fixed left-0 right-0 flex justify-center z-40 pointer-events-none"
            style={{ bottom: cueBottom }}
          >
            <motion.button
              type="button"
              onClick={handleScrollToNextBelow}
              whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface border border-border text-text-secondary shadow-md text-sm font-medium hover:bg-surface-elevated transition-colors"
            >
              {/* Idle bob: a slow, patient nudge downward that says "there's
                  more below" — repeats just often enough to catch a glance. */}
              <motion.span
                className="inline-flex items-center"
                animate={prefersReducedMotion ? {} : { y: [0, 3, 0] }}
                transition={{
                  duration: 0.45,
                  ease: 'easeInOut',
                  repeat: Infinity,
                  repeatDelay: 4,
                  delay: 1.5,
                }}
              >
                <Icon name="caret-down" className="w-4 h-4" />
              </motion.span>
              {t('transcript.nextCorrection')}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Study pill lives here (not in the parent) so it shares the bottom
          cues' sheet-open gate. While a sheet is open we pass count={0} so it
          unmounts rather than floating at z-50 over the sheet's actions. */}
      {onLaunchStudy && (
        <StudyPrompt
          count={activeAnnotationId ? 0 : addedAnnotations.size}
          onLaunchStudy={onLaunchStudy}
        />
      )}
    </div>
  )
}
