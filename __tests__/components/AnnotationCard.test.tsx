// __tests__/components/AnnotationCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
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

describe('AnnotationCard', () => {
  it('renders correction for grammar annotation', () => {
    render(<AnnotationCard annotation={grammarAnnotation} onAddToPractice={() => {}} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })

  it('renders keep-this message for strength annotation', () => {
    render(<AnnotationCard annotation={strengthAnnotation} onAddToPractice={() => {}} />)
    expect(screen.getByText(/keep this/i)).toBeInTheDocument()
  })

  it('calls onAddToPractice when button is clicked', async () => {
    const onClick = vi.fn()
    render(<AnnotationCard annotation={grammarAnnotation} onAddToPractice={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    expect(onClick).toHaveBeenCalledWith(grammarAnnotation)
  })
})
