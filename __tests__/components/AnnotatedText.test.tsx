// __tests__/components/AnnotatedText.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotatedText } from '@/components/AnnotatedText'
import type { Annotation } from '@/lib/types'

describe('AnnotatedText', () => {
  const text = 'Yo fui al mercado.'
  const annotations: Annotation[] = [
    {
      id: 'ann-1',
      session_id: 's1',
      segment_id: 'seg-1',
      type: 'grammar',
      original: 'Yo fui',
      start_char: 0,
      end_char: 6,
      correction: 'Fui',
      explanation: 'Drop the pronoun.',
    },
  ]

  it('renders plain text when no annotations', () => {
    render(<AnnotatedText text={text} annotations={[]} onAnnotationClick={() => {}} />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('renders a highlighted span for the annotated phrase', () => {
    render(<AnnotatedText text={text} annotations={annotations} onAnnotationClick={() => {}} />)
    const span = screen.getByText('Yo fui')
    expect(span.tagName).toBe('MARK')
    expect(span).toHaveClass('cursor-pointer')
  })

  it('calls onAnnotationClick with the annotation when the mark is clicked', async () => {
    const onClick = vi.fn()
    render(<AnnotatedText text={text} annotations={annotations} onAnnotationClick={onClick} />)
    await userEvent.click(screen.getByText('Yo fui'))
    expect(onClick).toHaveBeenCalledWith(annotations[0])
  })

  it('renders text before and after the highlight correctly', () => {
    render(<AnnotatedText text={text} annotations={annotations} onAnnotationClick={() => {}} />)
    expect(screen.getByText(' al mercado.')).toBeInTheDocument()
  })
})
