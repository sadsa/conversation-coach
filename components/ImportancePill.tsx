// components/ImportancePill.tsx
//
// Soft importance signal rendered on AnnotationCard and WriteSheet.
// Replaces the older `★★★ / ★★☆ / ★☆☆` ASCII cluster with one outlined
// pill carrying a teacher-voice label:
//
//   • score 3 → "High priority"
//   • score 2 → "Worth remembering"
//   • score 1 → render nothing (a 1-of-3 signal isn't earning its weight
//     on every card; suppressing it removes a lot of low-signal noise).
//
// When `note` is provided the pill becomes a toggle that reveals the note
// underneath. With no note it renders as a static span — same visual,
// no false affordance.

'use client'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  score: number | null
  note: string | null
  expanded: boolean
  onToggle: () => void
  /** aria-label override for the toggle. Defaults to the importance pill aria. */
  toggleAriaKey?: string
}

/** Score 1 deliberately suppressed — see file header. */
export function importanceLabelKey(score: number | null): 'annotation.importantPillHigh' | 'annotation.importantPill' | null {
  if (score === 3) return 'annotation.importantPillHigh'
  if (score === 2) return 'annotation.importantPill'
  return null
}

const PILL_BASE =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors'

// Hierarchy: score 3 ("High priority") wears the FILLED rank-1 chip so it
// reads as one notch louder at a glance than score 2 ("Worth remembering"),
// which keeps the lighter outlined rank-2 chip. Same colour family, two
// weights — the eye lands on rank-1 first when both sit in the same view.
const PILL_VARIANTS: Record<'rank1' | 'rank2', { rest: string; hover: string; dot: string }> = {
  rank1: {
    rest: 'bg-pill-rank1 text-on-pill-rank1 border border-transparent',
    hover: 'hover:bg-pill-rank1/80',
    dot: 'bg-on-pill-rank1',
  },
  rank2: {
    rest: 'bg-pill-rank2/40 text-pill-amber border border-pill-rank2',
    hover: 'hover:bg-pill-rank2',
    dot: 'bg-pill-amber',
  },
}

export function ImportancePill({ score, note, expanded, onToggle, toggleAriaKey = 'annotation.importantPillAria' }: Props) {
  const { t } = useTranslation()
  const labelKey = importanceLabelKey(score)
  if (!labelKey) return null

  const variant = score === 3 ? PILL_VARIANTS.rank1 : PILL_VARIANTS.rank2
  const label = t(labelKey)
  const dot = (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${variant.dot}`}
      aria-hidden="true"
    />
  )

  if (note) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`${PILL_BASE} ${variant.rest} ${variant.hover}`}
        aria-label={t(toggleAriaKey)}
        aria-expanded={expanded}
      >
        {dot}
        {label}
      </button>
    )
  }

  return (
    <span className={`${PILL_BASE} ${variant.rest}`}>
      {dot}
      {label}
    </span>
  )
}
