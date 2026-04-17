// components/AnnotationSheet.tsx
'use client'
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useSwipeable } from 'react-swipeable'
import { useTranslation } from '@/components/LanguageProvider'
import { AnnotationCard } from '@/components/AnnotationCard'
import { Icon } from '@/components/Icon'
import type { Annotation, AnnotationType } from '@/lib/types'

interface Props {
  annotation: Annotation | null
  /** 1-indexed position of this annotation among the user's annotations. */
  position: { current: number; total: number } | null
  hasPrev: boolean
  hasNext: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void

  // Forwarded to AnnotationCard
  sessionId: string
  practiceItemId: string | null
  isWrittenDown: boolean
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
  onAnnotationWritten: (annotationId: string) => void
  onAnnotationUnwritten: (annotationId: string) => void
}

const TYPE_DOT_CLASS: Record<AnnotationType, string> = {
  grammar: 'bg-status-error',
  naturalness: 'bg-pill-amber',
}

/**
 * Docked review panel that replaces the centered modal for annotation review.
 *
 * Layout:
 * - Mobile: bottom-anchored, takes ~55vh, transcript stays scrollable above it.
 * - Desktop (md+): right-anchored full-height side panel ~400px wide.
 *
 * No backdrop and no `inset-0` overlay — the user keeps the transcript in
 * sight while reading the correction. The active mark gets a ring via
 * AnnotatedText's `activeAnnotationId` so the user keeps their place.
 */
export function AnnotationSheet({
  annotation,
  position,
  hasPrev,
  hasNext,
  onClose,
  onPrev,
  onNext,
  ...cardProps
}: Props) {
  const { t } = useTranslation()
  const prefersReducedMotion = useReducedMotion()
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  // Set by the aside's React capture handler before the native document
  // listener fires. React events delegate from the root container, which is a
  // descendant of <body>, so our onMouseDownCapture on the aside runs strictly
  // before document.addEventListener('mousedown') in the bubble phase. Using a
  // flag instead of ref.contains avoids edge cases with SVG targets and
  // framer-motion's re-renders racing with the ref attachment.
  const insidePointerRef = useRef(false)

  const isOpen = annotation !== null

  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowLeft' && hasPrev) {
        onPrev()
      } else if (e.key === 'ArrowRight' && hasNext) {
        onNext()
      }
    }

    // Close when the user taps anywhere outside the sheet — except on another
    // annotation mark, which should swap content via TranscriptView's own
    // onClick handler instead of closing-then-reopening.
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (insidePointerRef.current) {
        insidePointerRef.current = false
        return
      }
      const target = e.target as Element | null
      if (target?.closest('[data-annotation-id]')) return
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      previousFocusRef.current?.focus()
    }
  }, [isOpen, onClose, onPrev, onNext, hasPrev, hasNext])

  function markInsidePointer() {
    insidePointerRef.current = true
  }

  const swipeHandlers = useSwipeable({
    onSwipedDown: (e) => { if (e.absY > 60) onClose() },
    onSwipedLeft: (e) => { if (e.absX > 60 && hasNext) onNext() },
    onSwipedRight: (e) => { if (e.absX > 60 && hasPrev) onPrev() },
    delta: 20,
    trackMouse: false,
  })

  if (!isOpen || !annotation) return null

  // Plain mount/unmount — no AnimatePresence. Entry animation is a CSS
  // keyframe so we get a slide-up on open without keeping the sheet mounted
  // through an exit animation (which would break "closes" tests and feel
  // sluggish to dismiss).
  const animationClass = prefersReducedMotion
    ? 'motion-reduce:animate-none'
    : 'motion-safe:animate-[sheet-up_240ms_cubic-bezier(0.16,1,0.3,1)_both] md:motion-safe:animate-[sheet-in-right_240ms_cubic-bezier(0.16,1,0.3,1)_both]'

  return (
    <>
      <aside
        role="complementary"
        aria-label={t('transcript.openCorrection')}
        onMouseDownCapture={markInsidePointer}
        onTouchStartCapture={markInsidePointer}
        className={`
          fixed left-0 right-0 bottom-0 z-40
          md:left-auto md:top-11 md:right-0 md:bottom-0 md:w-[400px]
          bg-surface-elevated border-t border-border md:border-t-0 md:border-l
          shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.18)] md:shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.12)]
          rounded-t-2xl md:rounded-none
          flex flex-col max-h-[60vh] md:max-h-none
          ${animationClass}
        `}
        {...swipeHandlers}
      >
          {/* Mobile drag handle — visual + a11y hint that this is dismissable */}
          <div className="flex justify-center pt-2 pb-1 md:hidden" aria-hidden="true">
            <span className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* Header row: type, position, navigation, close */}
          <header className="flex items-center gap-2 px-4 pt-1 pb-3 md:pt-5 md:pb-4 md:px-5 border-b border-border">
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT_CLASS[annotation.type]}`}
            />
            <h2 className="font-semibold text-text-primary">
              {t(`type.${annotation.type}`)}
            </h2>

            {position && (
              <span className="text-xs text-text-tertiary tabular-nums ml-1">
                {t('sheet.position', { n: position.current, total: position.total })}
              </span>
            )}

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev}
                aria-label={t('sheet.prev')}
                className="w-9 h-9 rounded-md flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Icon name="chevron-left" className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                aria-label={t('sheet.next')}
                className="w-9 h-9 rounded-md flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Icon name="chevron-right" className="w-5 h-5" />
              </button>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label={t('sheet.close')}
                className="w-9 h-9 ml-1 rounded-md flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg transition-colors"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>
          </header>

        {/* Body: card content. We key on annotation.id so React swaps the
            subtree cleanly when the user navigates prev/next. A short CSS
            fade gives a subtle transition without keeping the previous
            annotation mounted. */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div
            key={annotation.id}
            className="motion-safe:animate-[fadein_180ms_ease-out_both]"
          >
            <AnnotationCard
              annotation={annotation}
              {...cardProps}
            />
          </div>
        </div>
      </aside>
    </>
  )
}
