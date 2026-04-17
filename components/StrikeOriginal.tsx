// components/StrikeOriginal.tsx
// Shared "wrong → right" treatment used across the practice list row, the
// practice item sheet, and the empty-state teaching example. Centralising
// the strikethrough + correction colours keeps these surfaces visually in
// lockstep when we tune the colour ramp.

interface Props {
  original: string
  /**
   * Practice items can lack a correction (annotation type "naturalness" with
   * no rewrite). When null we render the original on its own — no strike,
   * no arrow — so the user still gets the surface text to anchor on.
   */
  correction: string | null
  /**
   * When true (e.g. the "Written" view), uses lower-contrast colours so the
   * row reads as resolved rather than competing with active items.
   */
  muted?: boolean
  /** Visual scale — `'row'` (compact) or `'sheet'` (display, slightly larger). */
  size?: 'row' | 'sheet'
}

export function StrikeOriginal({ original, correction, muted = false, size = 'row' }: Props) {
  const wrapperClass =
    size === 'sheet' ? 'text-base md:text-lg leading-relaxed' : 'text-base leading-relaxed'
  const correctionScale = size === 'sheet' ? 'text-lg md:text-xl' : ''
  const correctionColor = muted ? 'text-text-secondary' : 'text-correction'
  const originalColor = muted
    ? 'text-text-tertiary line-through decoration-text-tertiary/30'
    : 'text-text-tertiary line-through decoration-text-tertiary/40'

  if (correction === null) {
    return (
      <p className={wrapperClass}>
        <span className={`font-semibold ${correctionScale} ${muted ? 'text-text-secondary' : 'text-text-primary'}`}>
          {original}
        </span>
      </p>
    )
  }

  return (
    <p className={wrapperClass}>
      <span className={`mr-2 ${originalColor}`}>{original}</span>
      <span className={`font-semibold ${correctionScale} ${correctionColor}`}>{correction}</span>
    </p>
  )
}
