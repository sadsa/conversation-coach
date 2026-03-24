// __tests__/components/AnnotationCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { Annotation } from '@/lib/types'

const grammarAnnotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6,
  correction: 'Fui', explanation: 'Drop the subject pronoun.', sub_category: 'subjunctive',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
}

const defaultProps = {
  sessionId: 's1',
  isAdded: false,
  onAnnotationAdded: vi.fn(),
  // onClose removed — now owned by Modal
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AnnotationCard', () => {
  it('renders correction for grammar annotation', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })

  it('renders disabled "Added" button when isAdded is true', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} isAdded={true} />)
    const btn = screen.getByRole('button', { name: /added to practice/i })
    expect(btn).toBeDisabled()
  })

  it('does not call fetch when isAdded is true and button is clicked', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} isAdded={true} />)
    await userEvent.click(screen.getByRole('button', { name: /added to practice/i }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls fetch and onAnnotationAdded on successful add', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationAdded = vi.fn()
    render(
      <AnnotationCard
        annotation={grammarAnnotation}
        {...defaultProps}
        onAnnotationAdded={onAnnotationAdded}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    expect(fetchSpy).toHaveBeenCalledWith('/api/practice-items', expect.objectContaining({ method: 'POST' }))
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1')
    expect(screen.getByRole('button', { name: /added to practice/i })).toBeDisabled()
  })

  it('leaves button enabled on fetch failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    expect(screen.getByRole('button', { name: /add to practice/i })).not.toBeDisabled()
  })

  it('renders sub-category pill', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.getByText('Subjunctive')).toBeInTheDocument()
  })

  it('renders sub-category pill when isAdded is true', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} isAdded={true} />)
    expect(screen.getByText('Subjunctive')).toBeInTheDocument()
  })

  it('includes sub_category in POST body when adding to practice', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true } as Response
    })
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    expect(capturedBody.sub_category).toBe('subjunctive')
  })

  it('includes flashcard fields in POST body when annotation has them', async () => {
    const annotationWithFlashcard: Annotation = {
      ...grammarAnnotation,
      flashcard_front: 'I [[went]] to the market.',
      flashcard_back: '[[Fui]] al mercado.',
      flashcard_note: 'Subject pronouns are dropped in Rioplatense.',
    }
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true } as Response
    })
    render(<AnnotationCard annotation={annotationWithFlashcard} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    expect(capturedBody.flashcard_front).toBe('I [[went]] to the market.')
    expect(capturedBody.flashcard_back).toBe('[[Fui]] al mercado.')
    expect(capturedBody.flashcard_note).toBe('Subject pronouns are dropped in Rioplatense.')
  })

  it('sends null flashcard fields when annotation has none', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true } as Response
    })
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    expect(capturedBody.flashcard_front).toBeNull()
    expect(capturedBody.flashcard_back).toBeNull()
    expect(capturedBody.flashcard_note).toBeNull()
  })
})
