import { useCallback, useEffect, useRef, useState } from 'react'

type InstallPromptEvent = Event & { prompt: () => Promise<{ outcome: string }> }

/** Captures the browser's beforeinstallprompt event and exposes a trigger. */
export function useInstallPrompt(): { isSupported: boolean; prompt: () => Promise<void> } {
  const [isSupported, setIsSupported] = useState(false)
  const eventRef = useRef<InstallPromptEvent | null>(null)

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault()
      eventRef.current = e as InstallPromptEvent
      setIsSupported(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const prompt = useCallback(async () => {
    if (!eventRef.current) return
    await eventRef.current.prompt()
    eventRef.current = null
    setIsSupported(false)
  }, [])

  return { isSupported, prompt }
}
