// __tests__/components/AnnotationCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { Annotation } from '@/lib/types'

const grammarAnnotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6,
  correction: 'Fui', explanation: 'Drop the subject pronoun.',
}
const strengthAnnotation: Annotation = {
  id: 'ann-2', session_id: 's1', segment_id: 'seg-1',
  type: 'strength', original: 'buenísimo', start_char: 0, end_char: 9,
  correction: null, explanation: 'Great superlative usage.',
}

const defaultProps = {
  sessionId: 's1',
  isAdded: false,
  onAnnotationAdded: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AnnotationCard', () => {
  it('renders correction for grammar annotation', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Yo fui')).toBeInTheDocument()   // ← add this line
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })

  it('renders keep-this message for strength annotation', () => {
    render(<AnnotationCard annotation={strengthAnnotation} {...defaultProps} />)
    expect(screen.getByText(/keep this/i)).toBeInTheDocument()
  })

  it('renders disabled "Added" button when isAdded is true', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} isAdded={true} />)
    const btn = screen.getByRole('button', { name: /added to practice/i })
    expect(btn).toBeDisabled()
  })

  it('does not call fetch when isAdded is true and button is clicked', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} isAdded={true} />)
    // button is disabled, click should be a no-op
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
    expect(fetchSpy).toHaveBeenCalledWith('/api/practice-items', expect.objectContaining({
      method: 'POST',
    }))
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1')
    // button should now show "Added"
    expect(screen.getByRole('button', { name: /added to practice/i })).toBeDisabled()
  })

  it('leaves button enabled on fetch failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    // button should still be enabled (not switched to Added state)
    expect(screen.getByRole('button', { name: /add to practice/i })).not.toBeDisabled()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
