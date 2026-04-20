'use client'
//
// Top-of-page navigation progress indicator.
//
// Why this exists: with the App Router pages now doing real server-side
// data fetching, the gap between "user clicks a link" and "next page
// paints" is filled by a Next.js server round-trip rather than a
// post-hydration `useEffect`. That's a faster overall experience, but
// during the round-trip the previous page stays on screen with no
// feedback that anything is happening — which feels broken on slower
// networks even when it isn't.
//
// This component fills that gap with a hairline accent bar at the top
// of the viewport. It starts on any in-app link click and finishes when
// `usePathname()` reports the destination has rendered.
//
// We deliberately don't reach for `nprogress` or any other dependency:
// the implementation is small, the only behaviour we need is "show
// progress while navigating", and keeping it inline lets us style it
// directly with the existing design tokens.

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const TICK_MS = 200          // how often we creep the bar forward
const TICK_BUMP = 8           // % per tick (slows asymptotically — see below)
const FADE_MS = 250           // post-completion hide animation
const RESET_MS = FADE_MS + 50

export function NavProgress() {
  const pathname = usePathname()
  // -1 = hidden, 0..100 = showing. The state is the rendered width %.
  const [progress, setProgress] = useState<number>(-1)
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPathRef = useRef<string>(pathname)

  // The bar starts when an in-app link is clicked. Listening at the
  // document level (capture phase, so we run before any preventDefault
  // a child component might call) is the cheapest way to catch all
  // navigation triggers — `<Link>`, plain `<a>` to internal routes,
  // anything that becomes an anchor after compilation.
  useEffect(() => {
    function clearTicker() {
      if (tickerRef.current) {
        clearInterval(tickerRef.current)
        tickerRef.current = null
      }
    }

    function startTicker() {
      clearTicker()
      setProgress(15)
      tickerRef.current = setInterval(() => {
        setProgress(p => {
          if (p < 0) return p
          // Decelerate as we approach 90% so we never lock at 100%
          // before the route actually finishes — that would look like
          // we're lying about completion.
          const target = 90
          const remaining = target - p
          if (remaining <= 0.5) return p
          return p + Math.max(0.5, (remaining * TICK_BUMP) / 100)
        })
      }, TICK_MS)
    }

    function onClick(e: MouseEvent) {
      // Honour the standard "open in new tab" modifier set so we don't
      // light up the bar for a navigation that won't actually change
      // this tab's pathname.
      if (e.defaultPrevented) return
      if (e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor) return

      // Anchor with explicit "open elsewhere" intent — leave it alone.
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href) return
      if (href.startsWith('#')) return
      if (/^[a-z]+:/i.test(href) && !href.startsWith(window.location.origin)) return

      // Resolve to a same-origin URL so we can compare pathnames cleanly.
      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      // Same pathname (just hash/query change) — Next won't trigger a
      // route transition, so don't show progress.
      if (url.pathname === window.location.pathname) return

      startTicker()
    }

    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      clearTicker()
    }
  }, [])

  // Pathname has changed → finish the bar.
  useEffect(() => {
    if (prevPathRef.current === pathname) return
    prevPathRef.current = pathname

    if (tickerRef.current) {
      clearInterval(tickerRef.current)
      tickerRef.current = null
    }
    setProgress(100)
    const hideTimer = setTimeout(() => setProgress(-1), RESET_MS)
    return () => clearTimeout(hideTimer)
  }, [pathname])

  if (progress < 0) return null
  return (
    <div
      aria-hidden
      className="fixed top-0 inset-x-0 z-[60] h-0.5 pointer-events-none"
    >
      <div
        className="h-full bg-accent-primary shadow-[0_0_8px_rgba(0,0,0,0.15)] origin-left"
        style={{
          width: `${progress}%`,
          transition: progress === 100
            ? `width ${FADE_MS}ms ease-out, opacity ${FADE_MS}ms ease-out ${FADE_MS / 2}ms`
            : `width ${TICK_MS}ms linear`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  )
}
