// __tests__/components/AnnotationCard.test.tsx
//
// Covers the redesigned action region: a primary verb-driven Save button
// (full-width, gets initial focus via `data-initial-focus`) plus the quiet
// "Not useful — hide it" affordance, which now lives in the ··· overflow menu
// on every viewport (no more viewport-split between a mobile menu and a
// desktop ghost button). Outcome hints are inline teacher-voice strings;
// errors no longer auto-dismiss but expose Retry. Mutual exclusion between
// Save and the dismiss action is preserved exactly as before.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { Annotation } from '@/lib/types'

// The dismiss action is reached by opening the overflow menu and clicking the
// "Not useful" / "Restore" menu item. Helper keeps the intent readable.
async function openDismissMenu() {
  await userEvent.click(screen.getByRole('button', { name: /more actions/i }))
}

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
  onAnnotationAdded: vi.fn(),
  onAnnotationRemoved: vi.fn(),
}

beforeEach(() => { vi.resetAllMocks() })

describe('AnnotationCard — content', () => {
  it('renders original, correction and explanation', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })

  it('does not render a sub-category pill (distilled — the user does not act on it)', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    expect(screen.queryByText('Subjunctive')).not.toBeInTheDocument()
  })
})

describe('AnnotationCard — saved + hidden state cues', () => {
  it('renders no extra hint paragraph in the neutral state', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    expect(screen.queryByText(/added to study list/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/hidden from your transcript/i)).not.toBeInTheDocument()
  })

  it('moves the saved confirmation into the primary button itself', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" />)
    expect(screen.getByRole('button', { name: /remove this correction from your vocabulary/i })).toHaveTextContent(/saved to (my )?vocabulary/i)
    // No secondary "View list" link / hint paragraph anymore — the button is the receipt.
    expect(screen.queryByRole('link', { name: /view list/i })).not.toBeInTheDocument()
  })

  it('keeps the hidden caption when is_unhelpful is true (the fade alone reads as loading)', () => {
    render(<AnnotationCard annotation={{ ...annotation, is_unhelpful: true }} {...defaultProps} />)
    expect(screen.getByText(/hidden from your transcript/i)).toBeInTheDocument()
  })
})

describe('AnnotationCard — written-down UI is gone', () => {
  it('no longer renders a "Mark as written down" control', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" />)
    expect(screen.queryByRole('button', { name: /written/i })).not.toBeInTheDocument()
  })
})

describe('AnnotationCard — primary save action', () => {
  it('marks the primary button with data-initial-focus so the sheet can focus it on open', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    const primary = screen.getByRole('button', { name: /save this correction to your vocabulary/i })
    expect(primary).toHaveAttribute('data-initial-focus')
  })

  it('POSTs a practice item and notifies parent when Save is tapped neutral', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'pi-1' }),
    } as Response)
    const onAnnotationAdded = vi.fn()
    render(<AnnotationCard annotation={annotation} {...defaultProps} onAnnotationAdded={onAnnotationAdded} />)
    await userEvent.click(screen.getByRole('button', { name: /save this correction to your vocabulary/i }))
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1', 'pi-1')
  })

  it('DELETEs the practice item and notifies parent when Save is tapped already-saved', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationRemoved = vi.fn()
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" onAnnotationRemoved={onAnnotationRemoved} />)
    await userEvent.click(screen.getByRole('button', { name: /remove this correction from your vocabulary/i }))
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
    await userEvent.click(screen.getByRole('button', { name: /save this correction to your vocabulary/i }))
    expect(capturedBody.annotation_id).toBe('ann-1')
    expect(capturedBody.sub_category).toBe('subjunctive')
    expect(capturedBody.original).toBe('Yo fui')
    expect(capturedBody.correction).toBe('Fui')
  })

  it('clears unhelpful first when Save is tapped on an already-dismissed card', async () => {
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

    await userEvent.click(screen.getByRole('button', { name: /save this correction to your vocabulary/i }))

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

describe('AnnotationCard — quiet "Not useful" action (overflow menu)', () => {
  it('exposes the dismiss action only inside the overflow menu, on every viewport', async () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    // Closed menu: no standalone dismiss button leaking into the body.
    expect(screen.queryByRole('menuitem', { name: /mark as not useful and hide from the transcript/i })).not.toBeInTheDocument()
    await openDismissMenu()
    expect(screen.getByRole('menuitem', { name: /mark as not useful and hide from the transcript/i })).toBeInTheDocument()
  })

  it('PATCHes is_unhelpful=true and shows the hidden caption without collapsing the row', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationUnhelpfulChanged = vi.fn()

    render(
      <AnnotationCard
        annotation={annotation}
        {...defaultProps}
        onAnnotationUnhelpfulChanged={onAnnotationUnhelpfulChanged}
      />,
    )

    await openDismissMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /mark as not useful and hide from the transcript/i }))

    expect(global.fetch).toHaveBeenCalledWith('/api/annotations/ann-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: true }),
    }))
    expect(onAnnotationUnhelpfulChanged).toHaveBeenCalledWith('ann-1', true)
    // Save button still present; card now reads as hidden.
    expect(screen.getByRole('button', { name: /save this correction to your vocabulary/i })).toBeInTheDocument()
    expect(screen.getByText(/hidden from your transcript/i)).toBeInTheDocument()
    // Reopening the menu shows the inverse "Restore" action.
    await openDismissMenu()
    expect(screen.getByRole('menuitem', { name: /restore this correction/i })).toBeInTheDocument()
  })

  it('renders pre-marked unhelpful annotations in the muted state on first render', async () => {
    render(
      <AnnotationCard
        annotation={{ ...annotation, is_unhelpful: true, unhelpful_at: '2026-04-19T00:00:00Z' }}
        {...defaultProps}
      />,
    )
    expect(screen.getByText(/hidden from your transcript/i)).toBeInTheDocument()
    await openDismissMenu()
    expect(screen.getByRole('menuitem', { name: /restore this correction/i })).toBeInTheDocument()
  })

  it('Restore flips state back and PATCHes is_unhelpful=false', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationUnhelpfulChanged = vi.fn()
    render(
      <AnnotationCard
        annotation={{ ...annotation, is_unhelpful: true, unhelpful_at: '2026-04-19T00:00:00Z' }}
        {...defaultProps}
        onAnnotationUnhelpfulChanged={onAnnotationUnhelpfulChanged}
      />,
    )

    await openDismissMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /restore this correction/i }))

    expect(global.fetch).toHaveBeenCalledWith('/api/annotations/ann-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: false }),
    }))
    expect(onAnnotationUnhelpfulChanged).toHaveBeenCalledWith('ann-1', false)
    expect(screen.queryByText(/hidden from your transcript/i)).not.toBeInTheDocument()
  })

  it('reverts optimistic state and shows an error with Retry when PATCH fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    const onAnnotationUnhelpfulChanged = vi.fn()
    render(
      <AnnotationCard
        annotation={annotation}
        {...defaultProps}
        onAnnotationUnhelpfulChanged={onAnnotationUnhelpfulChanged}
      />,
    )

    await openDismissMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /mark as not useful and hide from the transcript/i }))

    expect(onAnnotationUnhelpfulChanged).toHaveBeenNthCalledWith(1, 'ann-1', true)
    expect(onAnnotationUnhelpfulChanged).toHaveBeenNthCalledWith(2, 'ann-1', false)
    // Reverted — the hidden caption is gone again.
    expect(screen.queryByText(/hidden from your transcript/i)).not.toBeInTheDocument()
    expect(screen.getByRole('status').textContent).toMatch(/.+/)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
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

    await openDismissMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /mark as not useful and hide from the transcript/i }))

    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/practice-items/pi-1', { method: 'DELETE' })
    expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/annotations/ann-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: true }),
    }))
    expect(onAnnotationRemoved).toHaveBeenCalledWith('ann-1')
    expect(onAnnotationUnhelpfulChanged).toHaveBeenCalledWith('ann-1', true)
  })
})

describe('AnnotationCard — saving state', () => {
  it('shows a "Saving…" label on the primary while the save POST is in flight', async () => {
    let resolveFetch: (v: Response) => void = () => {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve }),
    )
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /save this correction to your vocabulary/i }))
    expect(screen.getByRole('button', { name: /save this correction to your vocabulary/i })).toHaveTextContent(/saving/i)
    resolveFetch({ ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response)
  })
})

describe('AnnotationCard — Retry on error', () => {
  it('re-runs the failed save when Retry is tapped', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false } as Response) // first attempt fails
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response)

    const onAnnotationAdded = vi.fn()
    render(<AnnotationCard annotation={annotation} {...defaultProps} onAnnotationAdded={onAnnotationAdded} />)

    await userEvent.click(screen.getByRole('button', { name: /save this correction to your vocabulary/i }))
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1', 'pi-1')
  })
})

