// components/ScrollToTopOnNavigate.tsx
'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Restores scroll-to-top on forward navigation between pages.
 *
 * Why this exists: the App Router's built-in scroll handler calls
 * `htmlElement.scrollTop = 0` and then `domNode.focus()` on the new
 * segment's first DOM node. With our fixed 44px header overlaying the
 * top of <main>, the focused element ends up partially hidden under
 * the chrome — a common interaction with `position: fixed` headers.
 *
 * The `popstate` ref distinguishes browser back/forward (where the
 * browser restores the previous scroll position) from forward link
 * clicks (where we want top alignment). Without that guard, going
 * back would always slam to the top, which is the opposite of what
 * users expect.
 */
export function ScrollToTopOnNavigate() {
  const pathname = usePathname()
  const isPopRef = useRef(false)

  useEffect(() => {
    const onPop = () => {
      isPopRef.current = true
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (isPopRef.current) {
      isPopRef.current = false
      return
    }
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
