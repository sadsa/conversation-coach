// components/Wordmark.tsx
//
// The "Conversation Coach" wordmark. Brand name — same in all locales,
// intentionally not translated. Centralised here so the styling lives in one
// place rather than being copy-pasted across onboarding surfaces.

interface Props {
  className?: string
}

export function Wordmark({ className = '' }: Props) {
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-widest text-text-tertiary ${className}`}
    >
      Conversation Coach
    </p>
  )
}
