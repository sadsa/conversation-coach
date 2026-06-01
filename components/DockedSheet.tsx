// components/DockedSheet.tsx
//
// Shared chrome for the app's two review sheets — `AnnotationSheet` (transcript
// corrections) and `WriteSheet` (saved corrections in the Write list). Owns:
//
//   • Layout (Hush direction):
//       — Mobile: anchored to the BOTTOM OF THE VIEWPORT (`bottom-0`). The
//         sheet paints OVER the bottom nav while open, matching the
//         iOS / Android system bottom-sheet pattern. BottomNav (z-30) stays
//         mounted underneath; the sheet (z-40) just covers it visually until
//         dismiss.
//       — Desktop: right-anchored full-height panel below the app header.
//         Same Hush content vocabulary, geometry adapts to the wide viewport.
//   • Scrim (mobile-only): a soft dim layer sits between the page and the
//     sheet on mobile, focusing attention on the active correction and
//     making the tap-to-dismiss area obvious. Desktop intentionally omits
//     the scrim — the right panel exists so the user can keep referencing
//     the transcript on the left; dimming the page would defeat that.
//   • Header / chrome:
//       — No border-bottom on the header. The pagination + nav controls
//         visually float at the top of the body padding rather than living
//         in a banded region, matching the "patient, spacious" brand voice.
//       — Header padding matches body horizontal padding so the boundary
//         between header and body reads as continuous body.
//   • Animation: slide-up / slide-in-right keyframes from `globals.css`,
//     respecting `prefers-reduced-motion`. Scrim cross-fades with the sheet.
//   • A11y lifecycle: on open, focuses the first descendant marked
//     `[data-initial-focus]` if present (so the consumer's primary action gets
//     the cursor), otherwise the close button. Restores focus on close, listens
//     for Escape / ArrowLeft / ArrowRight, and closes on a pointer-down outside
//     the sheet (including taps on the scrim).
//   • Modal semantics: the aside carries `role="dialog"`. On mobile (the only
//     viewport that paints the scrim) it ALSO sets `aria-modal="true"` and
//     installs a Tab / Shift-Tab focus trap. Desktop deliberately omits both:
//     the right panel is meant to ACCOMPANY the page — the user can still tab
//     out into the transcript and back without losing context. The viewport
//     check is a `matchMedia('(min-width: 768px)')` listener so the semantics
//     flip cleanly if the user rotates / resizes mid-open.
//   • Gestures: swipe-down to close, swipe-left/right to navigate.
//   • Drag handle on mobile.
//   • Body: tracks scroll position via ResizeObserver and only renders the
//     bottom-fade overlay when the body actually overflows AND isn't scrolled
//     to the bottom — so short cards don't get a fake "more below" cue.
//   • Footer: tinted `surface-elevated` shelf. Absorbs the iOS home-indicator
//     safe-area inset on mobile (since the sheet now touches the viewport
//     edge); irrelevant on desktop where the panel sits inside the window.
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
  /**
   * Mobile max-height (Tailwind arbitrary value). Defaults to `80vh` — the
   * viewport anchoring change recovered ~4rem of vertical space from over
   * the (now-covered) bottom nav, so the default sits higher than before.
   */
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
  mobileMaxHeight = '80vh',
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
  const isDraggingRef = useRef(false)
  // Set true by the aside's React capture handler before the native document
  // listener fires. React events delegate from the root container (a descendant
  // of <body>), so `onMouseDownCapture` on the aside runs strictly before
  // `document.addEventListener('mousedown')` in the bubble phase. A flag
  // avoids edge cases with SVG targets and animation re-renders racing with
  // ref attachment.
  const insidePointerRef = useRef(false)
  const [showBottomFade, setShowBottomFade] = useState(false)
  // Tracks whether we're on the mobile viewport (sheet covers nav + scrim is
  // painted). Drives `aria-modal` and the focus-trap effect below. Defaults
  // to `false` in SSR / tests so server output matches the desktop sheet's
  // accompany-the-page semantics — the mobile override kicks in once the
  // matchMedia listener fires in the browser.
  const [isMobileViewport, setIsMobileViewport] = useState(false)

  // Keep `isMobileViewport` in sync with the `md` breakpoint Tailwind uses
  // throughout the sheet's class names. A single source of truth means the
  // scrim, max-height, and modal semantics can never disagree about which
  // mode the sheet is rendering in.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobileViewport(mq.matches)
    sync()
    // `addEventListener` on MediaQueryList has been universally supported
    // since Safari 14 (Sept 2020) — within our PWA install base. The
    // deprecated `addListener` shim was removed when TS dropped it.
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

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
      } else if (e.key === 'Tab' && isMobileViewport) {
        // Mobile-only focus trap. Desktop intentionally lets Tab walk back
        // out into the transcript so users can cross-reference — that's the
        // "panel accompanies" principle. On mobile the scrim hides whatever
        // sits behind the sheet, so escaping focus there would leave keyboard
        // users orientated at content they can't see.
        const sheetEl = sheetRef.current
        if (!sheetEl) return
        const focusables = Array.from(
          sheetEl.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(el => !el.hasAttribute('inert'))
        if (focusables.length === 0) return
        const first = focusables[0]!
        const last = focusables[focusables.length - 1]!
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey && (active === first || !sheetEl.contains(active))) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (active === last || !sheetEl.contains(active))) {
          e.preventDefault()
          first.focus()
        }
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
  }, [isOpen, onClose, onPrev, onNext, hasPrev, hasNext, preserveOutsideSelector, isMobileViewport])

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

  // Imperatively translate the sheet element during a drag gesture. Bypasses
  // React renders entirely so the motion stays at 60 fps.
  function applyDragTransform(offset: number) {
    const el = sheetRef.current
    if (!el) return
    el.style.transition = 'none'
    el.style.transform = offset > 0 ? `translateY(${offset}px)` : ''
  }

  // Animate the sheet to `targetOffset` with a CSS transition, then call
  // `onComplete` and clear the inline transition so subsequent animations
  // (e.g. the entrance keyframe on next open) aren't blocked.
  function snapDragTransform(targetOffset: number, onComplete?: () => void) {
    const el = sheetRef.current
    if (!el) return
    el.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)'
    el.style.transform = targetOffset > 0 ? `translateY(${targetOffset}px)` : ''
    const handler = () => {
      el.removeEventListener('transitionend', handler)
      el.style.transition = ''
      onComplete?.()
    }
    el.addEventListener('transitionend', handler)
  }

  const swipeHandlers = useSwipeable({
    onSwiping: (e) => {
      if (e.dir === 'Down') {
        isDraggingRef.current = true
        applyDragTransform(e.absY)
      }
    },
    onSwipedDown: (e) => {
      isDraggingRef.current = false
      if (e.absY > SWIPE_THRESHOLD) {
        // Animate offscreen then dismiss — the element must stay mounted until
        // the transition ends, so we delay onClose() via the callback.
        snapDragTransform(window.innerHeight, () => {
          applyDragTransform(0) // reset so the next open starts clean
          onClose()
        })
      } else {
        snapDragTransform(0) // spring back
      }
    },
    onSwipedLeft: (e) => { if (e.absX > SWIPE_THRESHOLD && hasNext) onNext?.() },
    onSwipedRight: (e) => { if (e.absX > SWIPE_THRESHOLD && hasPrev) onPrev?.() },
    // onSwiped fires after every direction-specific handler. If the gesture
    // ended as something other than Down but we had started tracking a
    // downward drag offset, reset it now.
    onSwiped: () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        applyDragTransform(0)
      }
    },
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

  const scrimAnimationClass = prefersReducedMotion
    ? ''
    : 'motion-safe:animate-[fadein_240ms_ease-out_both]'

  return (
    <>
      {/* Mobile-only scrim. Sits between the page and the sheet (z-30, above
          BottomNav). Catches taps so the user can't accidentally fire a nav
          tab while trying to dismiss; the document-level outside-pointer
          handler converts the tap into an `onClose`. Hidden on desktop —
          the right panel is meant to sit alongside the page, not interrupt
          reading of it (see the file header for the rule). */}
      <div
        aria-hidden="true"
        className={`
          md:hidden fixed inset-0 z-30 bg-scrim
          ${scrimAnimationClass}
        `}
      />

      <aside
        ref={composedRef}
        // `role="dialog"` is the most accurate description of the sheet — it's
        // a focused interaction surface. We keep the `<aside>` element so the
        // `complementary` landmark is still semantically there for AT users
        // that haven't reached the dialog yet (browsers + screen readers
        // resolve the explicit role over the implicit one). `aria-modal` is
        // mobile-only; see the file header for the principle.
        role="dialog"
        aria-label={ariaLabel}
        aria-modal={isMobileViewport ? true : undefined}
        onMouseDownCapture={markInsidePointer}
        onTouchStartCapture={markInsidePointer}
        // `--sheet-mobile-max-h` lets us keep the mobile max-height as an arbitrary
        // value while still being tree-shaken correctly by Tailwind's JIT scanner
        // (interpolating into the className string would not get picked up).
        style={{ '--sheet-mobile-max-h': mobileMaxHeight } as React.CSSProperties}
        className={`
          fixed left-0 right-0 z-40
          bottom-0
          md:left-auto md:right-0 md:w-[400px]
          md:top-[calc(var(--header-height)+env(safe-area-inset-top))]
          bg-surface md:border-l md:border-border-subtle
          shadow-[0_-18px_40px_-22px_rgba(0,0,0,0.22)] md:shadow-[-18px_0_40px_-22px_rgba(0,0,0,0.15)]
          rounded-t-2xl md:rounded-none
          flex flex-col max-h-[var(--sheet-mobile-max-h)] md:max-h-none
          ${animationClass}
        `}
        {...swipeProps}
      >
        {/* Mobile drag handle — visual + a11y hint that this is dismissable.
            Slimmer than before to match the quieter Hush chrome. */}
        <div className="flex justify-center pt-2.5 pb-1 md:hidden" aria-hidden="true">
          <span className="w-8 h-1 rounded-full bg-border opacity-60" />
        </div>

        {/* Header: no border-b, padding matches the body so the boundary
            reads as continuous body. The nav controls + position pill
            visually float at the top of the body padding rather than
            occupying a banded region — that's the Hush direction. */}
        <header className="hidden md:flex items-center gap-2 px-5 pt-2 pb-2 md:pt-4 md:pb-3">
          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
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
            className="h-full overflow-y-auto px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pt-2"
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
              bg-gradient-to-t from-surface to-transparent
              transition-opacity duration-150
              ${showBottomFade ? 'opacity-100' : 'opacity-0'}
            `}
          />
        </div>

        {footer && (
          // Tinted shelf footer. Mobile picks up the iOS home-indicator safe
          // area inset directly (the sheet now touches the viewport edge).
          // Desktop keeps the modest top border — gives the action region
          // visual anchorage at the bottom of the tall panel.
          <footer
            className="
              px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] md:pb-3
              border-t border-border-subtle bg-surface-elevated
            "
          >
            {footer}
          </footer>
        )}
      </aside>
    </>
  )
}
