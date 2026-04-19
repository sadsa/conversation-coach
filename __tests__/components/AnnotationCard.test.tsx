// __tests__/components/AnnotationCard.test.tsx
//
// Covers the new 👍/👎-only action row. The card has exactly two buttons,
// they're mutually exclusive, and "Mark as written down" no longer lives
// here — it's the /write page's concern (Write ↔ Written segmented view).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { Annotation } from '@/lib/types'

const annotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6,
  correction: 'Fui', explanation: 'Drop the subject pronoun.', sub_category: 'subjunctive',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
  importance_score: null, importance_note: null,
  is_unhelpful: false, unhelpful_at: null,
}

const defaultProps = {
  sessionId: 's1',
  practiceItemId: null,
  isWrittenDown: false,
  onAnnotationAdded: vi.fn(),
  onAnnotationRemoved: vi.fn(),
  onAnnotationWritten: vi.fn(),
  onAnnotationUnwritten: vi.fn(),
}

beforeEach(() => { vi.resetAllMocks() })

describe('AnnotationCard — content', () => {
  it('renders original, correction, explanation and sub-category', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
    expect(screen.getByText('Subjunctive')).toBeInTheDocument()
  })
})

describe('AnnotationCard — state hint', () => {
  it('shows "No feedback yet" in the neutral state', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    expect(screen.getByText('No feedback yet')).toBeInTheDocument()
  })

  it('shows "Saved as helpful" once practiceItemId is set', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" />)
    expect(screen.getByText('Saved as helpful')).toBeInTheDocument()
  })

  it('shows "Marked unhelpful" when is_unhelpful is true', () => {
    render(<AnnotationCard annotation={{ ...annotation, is_unhelpful: true }} {...defaultProps} />)
    expect(screen.getByText('Marked unhelpful')).toBeInTheDocument()
  })
})

describe('AnnotationCard — written-down UI is gone', () => {
  it('no longer renders a "Mark as written down" control', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" />)
    expect(screen.queryByRole('button', { name: /written/i })).not.toBeInTheDocument()
  })
})

describe('AnnotationCard — helpful (👍)', () => {
  it('POSTs a practice item and notifies parent when 👍 is tapped neutral', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'pi-1' }),
    } as Response)
    const onAnnotationAdded = vi.fn()
    render(<AnnotationCard annotation={annotation} {...defaultProps} onAnnotationAdded={onAnnotationAdded} />)
    await userEvent.click(screen.getByRole('button', { name: /helpful — save this correction/i }))
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1', 'pi-1')
  })

  it('DELETEs the practice item and notifies parent when 👍 is tapped already-saved', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationRemoved = vi.fn()
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" onAnnotationRemoved={onAnnotationRemoved} />)
    await userEvent.click(screen.getByRole('button', { name: /undo helpful/i }))
    expect(global.fetch).toHaveBeenCalledWith('/api/practice-items/pi-1', { method: 'DELETE' })
    expect(onAnnotationRemoved).toHaveBeenCalledWith('ann-1')
  })

  it('includes flashcard fields in the POST body', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /helpful — save this correction/i }))
    expect(capturedBody.annotation_id).toBe('ann-1')
    expect(capturedBody.sub_category).toBe('subjunctive')
    expect(capturedBody.original).toBe('Yo fui')
    expect(capturedBody.correction).toBe('Fui')
  })

  it('clears unhelpful first when 👍 is tapped on an already-dismissed card', async () => {
    // First call: PATCH is_unhelpful=false. Second: POST practice-items.
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response)

    const onAnnotationUnhelpfulChanged = vi.fn()
    const onAnnotationAdded = vi.fn()

    render(
      <AnnotationCard
        annotation={{ ...annotation, is_unhelpful: true }}
        {...defaultProps}
        onAnnotationUnhelpfulChanged={onAnnotationUnhelpfulChanged}
        onAnnotationAdded={onAnnotationAdded}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /helpful — save this correction/i }))

    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/annotations/ann-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: false }),
    }))
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/practice-items', expect.objectContaining({
      method: 'POST',
    }))
    expect(onAnnotationUnhelpfulChanged).toHaveBeenCalledWith('ann-1', false)
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1', 'pi-1')
  })
})

describe('AnnotationCard — unhelpful (👎)', () => {
  it('PATCHes is_unhelpful=true and updates aria-pressed without collapsing the row', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationUnhelpfulChanged = vi.fn()

    render(
      <AnnotationCard
        annotation={annotation}
        {...defaultProps}
        onAnnotationUnhelpfulChanged={onAnnotationUnhelpfulChanged}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /not helpful — mark/i }))

    expect(global.fetch).toHaveBeenCalledWith('/api/annotations/ann-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: true }),
    }))
    expect(onAnnotationUnhelpfulChanged).toHaveBeenCalledWith('ann-1', true)
    // 👍 still present, 👎 now in the "undo" mode.
    expect(screen.getByRole('button', { name: /helpful — save/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /undo not helpful/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders pre-marked unhelpful annotations in the muted state on first render', () => {
    render(
      <AnnotationCard
        annotation={{ ...annotation, is_unhelpful: true, unhelpful_at: '2026-04-19T00:00:00Z' }}
        {...defaultProps}
      />,
    )
    const undo = screen.getByRole('button', { name: /undo not helpful/i })
    expect(undo).toHaveAttribute('aria-pressed', 'true')
  })

  it('Undo flips state back and PATCHes is_unhelpful=false', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationUnhelpfulChanged = vi.fn()
    render(
      <AnnotationCard
        annotation={{ ...annotation, is_unhelpful: true, unhelpful_at: '2026-04-19T00:00:00Z' }}
        {...defaultProps}
        onAnnotationUnhelpfulChanged={onAnnotationUnhelpfulChanged}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /undo not helpful/i }))

    expect(global.fetch).toHaveBeenCalledWith('/api/annotations/ann-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: false }),
    }))
    expect(onAnnotationUnhelpfulChanged).toHaveBeenCalledWith('ann-1', false)
    expect(screen.getByRole('button', { name: /not helpful — mark/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reverts optimistic state and shows an error when PATCH fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    const onAnnotationUnhelpfulChanged = vi.fn()
    render(
      <AnnotationCard
        annotation={annotation}
        {...defaultProps}
        onAnnotationUnhelpfulChanged={onAnnotationUnhelpfulChanged}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /not helpful — mark/i }))

    expect(onAnnotationUnhelpfulChanged).toHaveBeenNthCalledWith(1, 'ann-1', true)
    expect(onAnnotationUnhelpfulChanged).toHaveBeenNthCalledWith(2, 'ann-1', false)
    expect(screen.getByRole('button', { name: /not helpful — mark/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('status').textContent).toMatch(/.+/)
  })

  it('drops the saved practice item before marking unhelpful (mutual exclusion)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true } as Response) // DELETE practice item
      .mockResolvedValueOnce({ ok: true } as Response) // PATCH unhelpful

    const onAnnotationRemoved = vi.fn()
    const onAnnotationUnhelpfulChanged = vi.fn()

    render(
      <AnnotationCard
        annotation={annotation}
        {...defaultProps}
        practiceItemId="pi-1"
        onAnnotationRemoved={onAnnotationRemoved}
        onAnnotationUnhelpfulChanged={onAnnotationUnhelpfulChanged}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /not helpful — mark/i }))

    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/practice-items/pi-1', { method: 'DELETE' })
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/annotations/ann-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: true }),
    }))
    expect(onAnnotationRemoved).toHaveBeenCalledWith('ann-1')
    expect(onAnnotationUnhelpfulChanged).toHaveBeenCalledWith('ann-1', true)
  })
})
