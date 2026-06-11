import { useEffect, useState } from 'react'

/** Returns true if the app is running as an installed PWA (standalone mode). */
export function useIsInstalled(): boolean {
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const iosStandalone =
      'standalone' in navigator &&
      Boolean((navigator as Navigator & { standalone: boolean }).standalone)
    const androidStandalone = window.matchMedia('(display-mode: standalone)').matches
    setInstalled(iosStandalone || androidStandalone)
  }, [])

  return installed
}
