const AUTO_OPEN_FIRST_CORRECTION_KEY = 'cc:review:auto-open-first-correction:v1'

/**
 * Review UX preference: open the first correction automatically on session load.
 * Defaults to enabled when unset to remove first-interaction friction.
 */
export function getAutoOpenFirstCorrectionPreference(): boolean {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem(AUTO_OPEN_FIRST_CORRECTION_KEY)
  if (stored === null) return true
  return stored === '1'
}

export function setAutoOpenFirstCorrectionPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUTO_OPEN_FIRST_CORRECTION_KEY, enabled ? '1' : '0')
}

export const SETTINGS_KEYS = {
  autoOpenFirstCorrection: AUTO_OPEN_FIRST_CORRECTION_KEY,
} as const
