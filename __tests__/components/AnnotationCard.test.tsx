// __tests__/components/AnnotationCard.test.tsx
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
  it('shows "Not saved" when practiceItemId is null', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    expect(screen.getByText('Not saved')).toBeInTheDocument()
  })

  it('shows "Saved" when practiceItemId is set and not written', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" />)
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('shows "Written ✓" when isWrittenDown is true', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" isWrittenDown={true} />)
    expect(screen.getByText('Written ✓')).toBeInTheDocument()
  })
})

describe('AnnotationCard — star button', () => {
  it('star button is present', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    expect(screen.getByRole('button', { name: /save this correction/i })).toBeInTheDocument()
  })

  it('calls POST and onAnnotationAdded when star is tapped with no practice item', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'pi-1' }),
    } as Response)
    const onAnnotationAdded = vi.fn()
    render(<AnnotationCard annotation={annotation} {...defaultProps} onAnnotationAdded={onAnnotationAdded} />)
    await userEvent.click(screen.getByRole('button', { name: /save this correction/i }))
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1', 'pi-1')
  })

  it('calls DELETE and onAnnotationRemoved when star is tapped with existing practice item', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationRemoved = vi.fn()
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" onAnnotationRemoved={onAnnotationRemoved} />)
    await userEvent.click(screen.getByRole('button', { name: /remove from saved/i }))
    expect(onAnnotationRemoved).toHaveBeenCalledWith('ann-1')
  })

  it('includes required fields in POST body', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /save this correction/i }))
    expect(capturedBody.annotation_id).toBe('ann-1')
    expect(capturedBody.sub_category).toBe('subjunctive')
    expect(capturedBody.original).toBe('Yo fui')
    expect(capturedBody.correction).toBe('Fui')
  })
})

describe('AnnotationCard — check button', () => {
  it('check button is disabled when not saved', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} />)
    expect(screen.getByRole('button', { name: /mark as written down/i })).toBeDisabled()
  })

  it('check button is enabled when saved', () => {
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" />)
    expect(screen.getByRole('button', { name: /mark as written down/i })).not.toBeDisabled()
  })

  it('calls PATCH written_down:true and onAnnotationWritten when check is tapped (unwritten)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationWritten = vi.fn()
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" onAnnotationWritten={onAnnotationWritten} />)
    await userEvent.click(screen.getByRole('button', { name: /mark as written down/i }))
    expect(global.fetch).toHaveBeenCalledWith('/api/practice-items/pi-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ written_down: true }),
    }))
    expect(onAnnotationWritten).toHaveBeenCalledWith('ann-1')
  })

  it('calls PATCH written_down:false and onAnnotationUnwritten when check is tapped (already written)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationUnwritten = vi.fn()
    render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" isWrittenDown={true} onAnnotationUnwritten={onAnnotationUnwritten} />)
    await userEvent.click(screen.getByRole('button', { name: /unmark as written/i }))
    expect(global.fetch).toHaveBeenCalledWith('/api/practice-items/pi-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ written_down: false }),
    }))
    expect(onAnnotationUnwritten).toHaveBeenCalledWith('ann-1')
  })
})
