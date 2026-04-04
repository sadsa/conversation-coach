// __tests__/components/AnnotationCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { Annotation } from '@/lib/types'
import React from 'react'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onDragEnd, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
      React.createElement('div', { ...rest }, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const grammarAnnotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6,
  correction: 'Fui', explanation: 'Drop the subject pronoun.', sub_category: 'subjunctive',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
}

const defaultProps = {
  sessionId: 's1',
  practiceItemId: null,
  onAnnotationAdded: vi.fn(),
  onAnnotationRemoved: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
})

// Helper: click "Add to Practice", tick checkbox, click confirm
async function addViaSheet() {
  await userEvent.click(screen.getByRole('button', { name: /add to practice list/i }))
  await userEvent.click(screen.getByTestId('write-it-down-checkbox'))
  await userEvent.click(screen.getByTestId('write-it-down-confirm'))
}

describe('AnnotationCard', () => {
  it('renders correction for grammar annotation', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })

  it('shows muted "Added" button when practiceItemId is set', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} practiceItemId="pi-1" />)
    const btn = screen.getByRole('button', { name: /added to practice/i })
    expect(btn).not.toBeDisabled()
    expect(btn).toHaveClass('bg-gray-700')
  })

  it('shows indigo "Add" button when practiceItemId is null', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    const btn = screen.getByRole('button', { name: /add to practice list/i })
    expect(btn).toHaveClass('bg-indigo-600')
  })

  it('opens WriteItDownSheet when "Add to Practice" is clicked', async () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.queryByTestId('write-it-down-sheet')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /add to practice list/i }))
    expect(screen.getByTestId('write-it-down-sheet')).toBeInTheDocument()
  })

  it('calls POST and onAnnotationAdded with both ids on successful add', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'pi-1' }),
    } as Response)
    const onAnnotationAdded = vi.fn()
    render(
      <AnnotationCard
        annotation={grammarAnnotation}
        {...defaultProps}
        onAnnotationAdded={onAnnotationAdded}
      />
    )
    await addViaSheet()
    expect(fetchSpy).toHaveBeenCalledWith('/api/practice-items', expect.objectContaining({ method: 'POST' }))
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1', 'pi-1')
    expect(screen.getByRole('button', { name: /added to practice/i })).toBeInTheDocument()
  })

  it('leaves add button visible on POST failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await addViaSheet()
    expect(screen.getByRole('button', { name: /add to practice list/i })).toBeInTheDocument()
  })

  it('calls DELETE and onAnnotationRemoved on remove', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationRemoved = vi.fn()
    render(
      <AnnotationCard
        annotation={grammarAnnotation}
        {...defaultProps}
        practiceItemId="pi-1"
        onAnnotationRemoved={onAnnotationRemoved}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /added to practice/i }))
    expect(fetchSpy).toHaveBeenCalledWith('/api/practice-items/pi-1', expect.objectContaining({ method: 'DELETE' }))
    expect(onAnnotationRemoved).toHaveBeenCalledWith('ann-1')
    expect(screen.getByRole('button', { name: /add to practice list/i })).toBeInTheDocument()
  })

  it('keeps added button on DELETE failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} practiceItemId="pi-1" />)
    await userEvent.click(screen.getByRole('button', { name: /added to practice/i }))
    expect(screen.getByRole('button', { name: /added to practice/i })).toBeInTheDocument()
  })

  it('renders sub-category pill', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.getByText('Subjunctive')).toBeInTheDocument()
  })

  it('includes sub_category in POST body when adding to practice', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await addViaSheet()
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
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={annotationWithFlashcard} {...defaultProps} />)
    await addViaSheet()
    expect(capturedBody.flashcard_front).toBe('I [[went]] to the market.')
    expect(capturedBody.flashcard_back).toBe('[[Fui]] al mercado.')
    expect(capturedBody.flashcard_note).toBe('Subject pronouns are dropped in Rioplatense.')
  })

  it('sends null flashcard fields when annotation has none', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await addViaSheet()
    expect(capturedBody.flashcard_front).toBeNull()
    expect(capturedBody.flashcard_back).toBeNull()
    expect(capturedBody.flashcard_note).toBeNull()
  })
})
