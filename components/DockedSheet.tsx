// components/DockedSheet.tsx
//
// Shared chrome for the app's two review sheets — `AnnotationSheet` (transcript
// corrections) and `PracticeItemSheet` (practice items). Owns:
//
//   • Layout: bottom-anchored on mobile, right-anchored full-height on desktop.
//   • Animation: slide-up / slide-in-right keyframes from `globals.css`,
//     respecting `prefers-reduced-motion`.
//   • A11y lifecycle: focuses the close button on open, restores focus on
//     close, listens for Escape / ArrowLeft / ArrowRight, and closes on a
//     pointer-down outside the sheet.
//   • Gestures: swipe-down to close, swipe-left/right to navigate.
//   • Drag handle on mobile.
//   • Header layout: caller-supplied `headerLead` content + a standard
//     prev / next / close button trio sourced from the shared `IconButton`.
//
// Consumers stay focused on their domain content — pass a key + body via
// `contentKey` + `children` so the body fades in cleanly when the user
// navigates between items.

'use client'
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useSwipeable } from 'react-swipeable'
import { IconButton } from '@/components/IconButton'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  /** Whether the sheet is mounted. */
  isOpen: boolean
  /** Accessible label for the `<aside>` landmark. */
  ariaLabel: string
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
  /**
   * CSS selector identifying outside elements that should NOT cause the
   * sheet to close on pointer-down. Use this when the page surface contains
   * a list of items that should swap the sheet's content rather than dismiss
   * it (e.g. transcript marks, list rows).
   */
  preserveOutsideSelector?: string
  /** Mobile max-height (Tailwind arbitrary value). Defaults to `60vh`. */
  mobileMaxHeight?: string
  /** Leading content of the header row — title, eyebrow, dot, etc. */
  headerLead: React.ReactNode
  /** Optional sticky footer rendered below the body. */
  footer?: React.ReactNode
  /**
   * Identity for the body content. When this changes the body remounts and
   * replays the entrance fade — pair with prev/next navigation so consecutive
   * items get a subtle transition.
   */
  contentKey?: string | number
  children: React.ReactNode
}

const SHEET_ANIMATION =
  'motion-safe:animate-[sheet-up_240ms_cubic-bezier(0.16,1,0.3,1)_both] md:motion-safe:animate-[sheet-in-right_240ms_cubic-bezier(0.16,1,0.3,1)_both]'

const SWIPE_THRESHOLD = 60

export function DockedSheet({
  isOpen,
  ariaLabel,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  preserveOutsideSelector,
  mobileMaxHeight = '60vh',
  headerLead,
  footer,
  contentKey,
  children,
}: Props) {
  const { t } = useTranslation()
  const prefersReducedMotion = useReducedMotion()
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  // Set true by the aside's React capture handler before the native document
  // listener fires. React events delegate from the root container (a descendant
  // of <body>), so `onMouseDownCapture` on the aside runs strictly before
  // `document.addEventListener('mousedown')` in the bubble phase. A flag
  // avoids edge cases with SVG targets and animation re-renders racing with
  // ref attachment.
  const insidePointerRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowLeft' && hasPrev) {
        onPrev?.()
      } else if (e.key === 'ArrowRight' && hasNext) {
        onNext?.()
      }
    }

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (insidePointerRef.current) {
        insidePointerRef.current = false
        return
      }
      if (preserveOutsideSelector) {
        const target = e.target as Element | null
        if (target?.closest(preserveOutsideSelector)) return
      }
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
  }, [isOpen, onClose, onPrev, onNext, hasPrev, hasNext, preserveOutsideSelector])

  const swipeHandlers = useSwipeable({
    onSwipedDown: (e) => { if (e.absY > SWIPE_THRESHOLD) onClose() },
    onSwipedLeft: (e) => { if (e.absX > SWIPE_THRESHOLD && hasNext) onNext?.() },
    onSwipedRight: (e) => { if (e.absX > SWIPE_THRESHOLD && hasPrev) onPrev?.() },
    delta: 20,
    trackMouse: false,
  })

  if (!isOpen) return null

  function markInsidePointer() {
    insidePointerRef.current = true
  }

  const animationClass = prefersReducedMotion ? 'motion-reduce:animate-none' : SHEET_ANIMATION
  const showNav = onPrev !== undefined || onNext !== undefined

  return (
    <aside
      role="complementary"
      aria-label={ariaLabel}
      onMouseDownCapture={markInsidePointer}
      onTouchStartCapture={markInsidePointer}
      // `--sheet-mobile-max-h` lets us keep the mobile max-height as an arbitrary
      // value while still being tree-shaken correctly by Tailwind's JIT scanner
      // (interpolating into the className string would not get picked up).
      style={{ '--sheet-mobile-max-h': mobileMaxHeight } as React.CSSProperties}
      className={`
        fixed left-0 right-0 bottom-0 z-40
        md:left-auto md:top-11 md:right-0 md:bottom-0 md:w-[400px]
        bg-surface-elevated border-t border-border md:border-t-0 md:border-l
        shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.18)] md:shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.12)]
        rounded-t-2xl md:rounded-none
        flex flex-col max-h-[var(--sheet-mobile-max-h)] md:max-h-none
        ${animationClass}
      `}
      {...swipeHandlers}
    >
      {/* Mobile drag handle — visual + a11y hint that this is dismissable. */}
      <div className="flex justify-center pt-2 pb-1 md:hidden" aria-hidden="true">
        <span className="w-10 h-1 rounded-full bg-border" />
      </div>

      <header className="flex items-center gap-2 px-4 pt-1 pb-3 md:pt-5 md:pb-4 md:px-5 border-b border-border">
        {headerLead}

        <div className="ml-auto flex items-center gap-1">
          {showNav && (
            <>
              <IconButton
                icon="chevron-left"
                onClick={onPrev}
                disabled={!hasPrev}
                aria-label={t('sheet.prev')}
                hoverBg="bg"
              />
              <IconButton
                icon="chevron-right"
                onClick={onNext}
                disabled={!hasNext}
                aria-label={t('sheet.next')}
                hoverBg="bg"
              />
            </>
          )}
          <IconButton
            ref={closeButtonRef}
            icon="close"
            onClick={onClose}
            aria-label={t('sheet.close')}
            hoverBg="bg"
            className={showNav ? 'ml-1' : undefined}
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div
          key={contentKey}
          className="motion-safe:animate-[fadein_180ms_ease-out_both]"
        >
          {children}
        </div>
      </div>

      {footer && (
        <footer className="px-4 py-3 md:px-5 border-t border-border bg-surface-elevated">
          {footer}
        </footer>
      )}
    </aside>
  )
}
