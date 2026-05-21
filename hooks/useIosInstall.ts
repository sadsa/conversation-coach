import { useEffect, useState } from 'react'

/**
 * Returns true when the user is on iOS Safari and has NOT already installed
 * the app to their home screen (i.e. not running in standalone mode).
 * Returns false everywhere else — Android gets the native prompt, desktop
 * doesn't need instructions, and installed PWAs are already "installed."
 */
export function useIosInstall(): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const isIos = /iphone|ipad|ipod/i.test(ua)
    const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua)
    const isStandalone =
      'standalone' in navigator && (navigator as Navigator & { standalone: boolean }).standalone

    setShow(isIos && isSafari && !isStandalone)
  }, [])

  return show
}
