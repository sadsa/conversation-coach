// components/DockedSheet.tsx
//
// Shared chrome for the app's two review sheets — `AnnotationSheet` (transcript
// corrections) and `WriteSheet` (saved corrections in the Write list). Owns:
//
//   • Layout: bottom-anchored on mobile, right-anchored full-height on desktop.
//   • Animation: slide-up / slide-in-right keyframes from `globals.css`,
//     respecting `prefers-reduced-motion`.
//   • A11y lifecycle: on open, focuses the first descendant marked
//     `[data-initial-focus]` if present (so the consumer's primary action gets
//     the cursor), otherwise the close button. Restores focus on close, listens
//     for Escape / ArrowLeft / ArrowRight, and closes on a pointer-down outside
//     the sheet.
//   • Gestures: swipe-down to close, swipe-left/right to navigate.
//   • Drag handle on mobile.
//   • Header layout: caller-supplied `headerLead` content + a standard
//     prev / next / close button trio sourced from the shared `IconButton`.
//     The lead container is `flex-wrap min-w-0` so a long position pill can
//     reflow under the title on narrow screens without breaking the right-side
//     button cluster.
//   • Body: tracks scroll position via ResizeObserver and only renders the
//     bottom-fade overlay when the body actually overflows AND isn't scrolled
//     to the bottom — so short cards don't get a fake "more below" cue.
//
// Consumers stay focused on their domain content — pass a key + body via
// `contentKey` + `children` so the body fades in cleanly when the user
// navigates between items.

'use client'
import { useEffect, useRef, useState } from 'react'
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
  // `bodyRef` is the scrollable region only — used by the bottom-fade
  // observer. Focus targeting needs to look across the whole sheet
  // (header, body, footer) because consumers like WriteSheet park their
  // primary action in the sticky footer; restricting the selector to the
  // body would silently fall back to the close button on every open.
  // Mutable ref typing — `MutableRefObject<HTMLElement | null>` — because we
  // assign to `current` via the composed callback ref below.
  const sheetRef = useRef<HTMLElement | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Set true by the aside's React capture handler before the native document
  // listener fires. React events delegate from the root container (a descendant
  // of <body>), so `onMouseDownCapture` on the aside runs strictly before
  // `document.addEventListener('mousedown')` in the bubble phase. A flag
  // avoids edge cases with SVG targets and animation re-renders racing with
  // ref attachment.
  const insidePointerRef = useRef(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  // Lifecycle effect — installs document listeners while the sheet is open and
  // restores focus to the previously-active element on close. We deliberately
  // DO NOT depend on `contentKey` here so the previous-focus stash isn't
  // overwritten when the user navigates between items mid-open.
  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement | null

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        // Stop propagation so concurrent listeners (e.g. the voice controller's
        // Escape handler) don't also fire — the innermost layer wins.
        e.stopPropagation()
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
      const target = e.target as Element | null
      // Always preserve clicks on elements that have opted out of
      // closing the sheet (e.g. the voice trigger FAB).
      if (target?.closest('[data-sheet-preserve]')) return
      if (preserveOutsideSelector) {
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

  // Focus the consumer's preferred target on open AND on each item change.
  // Bumping `contentKey` reruns this effect so the new item's primary action
  // gets the cursor — which means the user can press Enter to action it
  // straight away. The body div is keyed by `contentKey` so the
  // [data-initial-focus] node is freshly mounted before this fires.
  useEffect(() => {
    if (!isOpen) return
    // Scope the search through `sheetRef` so consumers can park focus
    // anywhere in the sheet (header, body, footer). WriteSheet uses this to
    // land the cursor on the primary "Mark as written" button so Enter
    // actions it without an extra Tab. The document-wide fallback covers a
    // narrow timing window where framer-motion's `useReducedMotion` triggers
    // a render cycle while the composed ref is reattaching — the app
    // contract is one open sheet at a time, so the wider scope is safe.
    const initial =
      sheetRef.current?.querySelector<HTMLElement>('[data-initial-focus]') ??
      document.querySelector<HTMLElement>('[data-initial-focus]')
    if (initial) initial.focus()
    else closeButtonRef.current?.focus()
  }, [isOpen, contentKey])

  // Bottom-fade visibility tracking. We only show the gradient when the body
  // has scrollable overflow AND the user isn't at the bottom — that way short
  // cards don't carry a misleading "more below" cue, and once the user has
  // read everything the fade goes away cleanly.
  useEffect(() => {
    if (!isOpen) return
    const el = bodyRef.current
    if (!el) return

    function update() {
      if (!el) return
      const hasOverflow = el.scrollHeight > el.clientHeight + 1
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
      setShowBottomFade(hasOverflow && !atBottom)
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    // ResizeObserver is missing in jsdom and older Safari; the scroll
    // listener still keeps the fade in sync as the user navigates, which
    // is the dominant case. The observer is the icing on top for content
    // that shrinks/grows underneath the user (e.g. importance-note expand).
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro?.disconnect()
    }
  }, [isOpen, contentKey])

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

  // `useSwipeable` returns its own `ref` setter that we need to compose with
  // `sheetRef`. We pull `ref` out of the spread and forward to both — passing
  // the spread's `ref` and our own would silently shadow one (TS2783).
  const { ref: swipeRefSetter, ...swipeProps } = swipeHandlers
  const composedRef = (el: HTMLElement | null) => {
    sheetRef.current = el
    swipeRefSetter(el)
  }

  return (
    <aside
      ref={composedRef}
      role="complementary"
      aria-label={ariaLabel}
      onMouseDownCapture={markInsidePointer}
      onTouchStartCapture={markInsidePointer}
      // `--sheet-mobile-max-h` lets us keep the mobile max-height as an arbitrary
      // value while still being tree-shaken correctly by Tailwind's JIT scanner
      // (interpolating into the className string would not get picked up).
      style={{ '--sheet-mobile-max-h': mobileMaxHeight } as React.CSSProperties}
      className={`
        fixed left-0 right-0 z-20
        bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0
        md:left-auto md:right-0 md:w-[400px]
        md:top-[calc(var(--header-height)+env(safe-area-inset-top))]
        bg-surface-elevated border-t border-border md:border-t-0 md:border-l
        shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.18)] md:shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.12)]
        rounded-t-2xl md:rounded-none
        flex flex-col max-h-[var(--sheet-mobile-max-h)] md:max-h-none
        ${animationClass}
      `}
      {...swipeProps}
    >
      {/* Mobile drag handle — visual + a11y hint that this is dismissable. */}
      <div className="flex justify-center pt-2 pb-1 md:hidden" aria-hidden="true">
        <span className="w-10 h-1 rounded-full bg-border" />
      </div>

      <header className="flex items-start gap-2 px-4 pt-1 pb-3 md:pt-5 md:pb-4 md:px-5 border-b border-border">
        <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5 md:pt-0">
          {headerLead}
        </div>

        <div className="flex items-center gap-1 shrink-0">
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

      <div className="relative flex-1 min-h-0">
        <div
          ref={bodyRef}
          className="h-full overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          <div
            key={contentKey}
            className="motion-safe:animate-[fadein_180ms_ease-out_both]"
          >
            {children}
          </div>
        </div>
        {/* Scroll-shadow: only painted when the body actually overflows and the
            user isn't already at the bottom. Sits above the scroller, ignores
            pointer events so taps fall through to the content. */}
        <div
          aria-hidden="true"
          className={`
            pointer-events-none absolute inset-x-0 bottom-0 h-6
            bg-gradient-to-t from-surface-elevated to-transparent
            transition-opacity duration-150
            ${showBottomFade ? 'opacity-100' : 'opacity-0'}
          `}
        />
      </div>

      {footer && (
        <footer className="px-4 py-3 md:px-5 border-t border-border bg-surface-elevated">
          {footer}
        </footer>
      )}
    </aside>
  )
}
