import { describe, it, expect } from 'vitest'
import { deriveSessionReviewState } from '@/lib/session-review-state'
import type { AnnotationReviewSummary } from '@/lib/session-review-state'

describe('deriveSessionReviewState', () => {
  it('returns null when the session has no annotations', () => {
    expect(deriveSessionReviewState([])).toBeNull()
  })

  it('returns partial when all annotations are unacted on', () => {
    const annotations: AnnotationReviewSummary[] = [
      { is_unhelpful: false, isSaved: false },
      { is_unhelpful: false, isSaved: false },
    ]
    expect(deriveSessionReviewState(annotations)).toBe('partial')
  })

  it('returns partial when at least one annotation is unacted on', () => {
    const annotations: AnnotationReviewSummary[] = [
      { is_unhelpful: false, isSaved: true },
      { is_unhelpful: false, isSaved: false },  // unacted
    ]
    expect(deriveSessionReviewState(annotations)).toBe('partial')
  })

  it('returns partial when some are dismissed but some remain unacted on', () => {
    const annotations: AnnotationReviewSummary[] = [
      { is_unhelpful: true, isSaved: false },
      { is_unhelpful: false, isSaved: false },  // unacted
    ]
    expect(deriveSessionReviewState(annotations)).toBe('partial')
  })

  it('returns ready_to_study when all annotations are acted on and at least one saved', () => {
    const annotations: AnnotationReviewSummary[] = [
      { is_unhelpful: false, isSaved: true },
      { is_unhelpful: true, isSaved: false },
    ]
    expect(deriveSessionReviewState(annotations)).toBe('ready_to_study')
  })

  it('returns ready_to_study when all annotations are saved', () => {
    const annotations: AnnotationReviewSummary[] = [
      { is_unhelpful: false, isSaved: true },
      { is_unhelpful: false, isSaved: true },
    ]
    expect(deriveSessionReviewState(annotations)).toBe('ready_to_study')
  })

  it('returns ready_to_study when an annotation is both saved and dismissed', () => {
    // Saved takes priority — if it ended up in Vocabulary, it counts as saved
    const annotations: AnnotationReviewSummary[] = [
      { is_unhelpful: true, isSaved: true },
      { is_unhelpful: true, isSaved: false },
    ]
    expect(deriveSessionReviewState(annotations)).toBe('ready_to_study')
  })

  it('returns nothing_kept when all annotations are dismissed and none saved', () => {
    const annotations: AnnotationReviewSummary[] = [
      { is_unhelpful: true, isSaved: false },
      { is_unhelpful: true, isSaved: false },
    ]
    expect(deriveSessionReviewState(annotations)).toBe('nothing_kept')
  })

  it('returns nothing_kept for a single dismissed annotation with nothing saved', () => {
    const annotations: AnnotationReviewSummary[] = [
      { is_unhelpful: true, isSaved: false },
    ]
    expect(deriveSessionReviewState(annotations)).toBe('nothing_kept')
  })

  it('returns ready_to_study for a single saved annotation', () => {
    const annotations: AnnotationReviewSummary[] = [
      { is_unhelpful: false, isSaved: true },
    ]
    expect(deriveSessionReviewState(annotations)).toBe('ready_to_study')
  })
})
