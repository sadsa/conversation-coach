export type SessionReviewState = 'partial' | 'nothing_kept' | 'ready_to_study'

export interface AnnotationReviewSummary {
  is_unhelpful: boolean
  isSaved: boolean
}

/**
 * Derives the review state for a single session from its annotations.
 *
 * - null          — session has no annotations (not yet analysed, or no corrections found)
 * - partial       — at least one annotation has not been saved or dismissed
 * - ready_to_study — all annotations acted on; at least one saved to Vocabulary
 * - nothing_kept  — all annotations dismissed; none saved
 */
export function deriveSessionReviewState(
  annotations: AnnotationReviewSummary[],
): SessionReviewState | null {
  if (annotations.length === 0) return null

  let savedCount = 0
  let unactedCount = 0

  for (const ann of annotations) {
    if (ann.isSaved) {
      savedCount++
    } else if (!ann.is_unhelpful) {
      unactedCount++
    }
  }

  if (unactedCount > 0) return 'partial'
  if (savedCount > 0) return 'ready_to_study'
  return 'nothing_kept'
}
