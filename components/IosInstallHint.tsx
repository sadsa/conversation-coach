'use client'
import { useIosInstall } from '@/hooks/useIosInstall'

/**
 * Inline iOS install nudge — renders only in iOS Safari when the app is not
 * already installed. Uses the literal Safari Share icon so the instruction
 * is unambiguous without extra words.
 */
export function IosInstallHint() {
  const show = useIosInstall()
  if (!show) return null

  return (
    <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
      Tap
      {/* Safari Share icon — box with arrow pointing up */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="inline-block flex-shrink-0"
      >
        <path d="M8.25 7.5l3.75-4 3.75 4" />
        <path d="M12 3.5v10" />
        <path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
      </svg>
      then <span className="font-medium text-text-secondary">Add to Home Screen</span>
    </p>
  )
}
