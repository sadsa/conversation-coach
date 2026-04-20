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
  'inline-flex items-center gap-1.5 rounded-full border border-pill-rank2-bg text-pill-amber px-2.5 py-1 text-xs font-medium'

export function ImportancePill({ score, note, expanded, onToggle, toggleAriaKey = 'annotation.importantPillAria' }: Props) {
  const { t } = useTranslation()
  const labelKey = importanceLabelKey(score)
  if (!labelKey) return null

  const label = t(labelKey)
  const dot = <span className="w-1.5 h-1.5 rounded-full bg-pill-amber shrink-0" aria-hidden="true" />

  if (note) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`${PILL_BASE} bg-pill-rank2-bg/40 hover:bg-pill-rank2-bg transition-colors`}
        aria-label={t(toggleAriaKey)}
        aria-expanded={expanded}
      >
        {dot}
        {label}
      </button>
    )
  }

  return (
    <span className={`${PILL_BASE} bg-pill-rank2-bg/40`}>
      {dot}
      {label}
    </span>
  )
}
