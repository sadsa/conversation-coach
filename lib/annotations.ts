import { SUB_CATEGORIES, SUB_CATEGORY_TYPE_MAP } from '@/lib/types'
import type { ClaudeAnnotation } from '@/lib/claude'

/**
 * Normalise raw Claude annotations against the source segment texts:
 * - Corrects character offsets when they don't match the original phrase.
 * - Coerces invalid sub_category values to 'other'.
 * - Drops annotations with importance_score === 1.
 */
export function normaliseAnnotations(
  annotations: ClaudeAnnotation[],
  segmentTextById: Map<string, string>,
): ClaudeAnnotation[] {
  const corrected = annotations.map(a => {
    let out = { ...a }

    const segText = segmentTextById.get(a.segment_id)
    if (segText && segText.slice(out.start_char, out.end_char) !== out.original) {
      const idx = segText.indexOf(out.original)
      if (idx !== -1) {
        out = { ...out, start_char: idx, end_char: idx + out.original.length }
      }
    }

    const rawSubCat = out.sub_category
    const isValidKey = typeof rawSubCat === 'string' && (SUB_CATEGORIES as readonly string[]).includes(rawSubCat)
    const expectedType = isValidKey ? SUB_CATEGORY_TYPE_MAP[rawSubCat as keyof typeof SUB_CATEGORY_TYPE_MAP] : undefined
    const subCategory = (isValidKey && (expectedType === undefined || expectedType === out.type))
      ? rawSubCat
      : 'other'

    return { ...out, sub_category: subCategory }
  })

  return corrected.filter(a => a.importance_score !== 1)
}
