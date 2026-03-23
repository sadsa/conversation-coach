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
      sub_category: 'other',
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

  it('applies dark-chip colour classes to grammar annotations', () => {
    render(<AnnotatedText text={text} annotations={annotations} onAnnotationClick={() => {}} />)
    const mark = screen.getByText('Yo fui')
    expect(mark).toHaveClass('bg-[#3b1a1a]')
    expect(mark).toHaveClass('text-[#fca5a5]')
    expect(mark).toHaveClass('decoration-[#f87171]')
  })

  it('shows the added badge when the annotation is in addedAnnotationIds', () => {
    render(
      <AnnotatedText
        text={text}
        annotations={annotations}
        onAnnotationClick={() => {}}
        addedAnnotationIds={new Set(['ann-1'])}
      />
    )
    expect(screen.getByTestId('annotation-added-badge-ann-1')).toBeInTheDocument()
  })

  it('does not show the added badge when addedAnnotationIds is empty', () => {
    render(
      <AnnotatedText
        text={text}
        annotations={annotations}
        onAnnotationClick={() => {}}
        addedAnnotationIds={new Set()}
      />
    )
    expect(screen.queryByTestId('annotation-added-badge-ann-1')).not.toBeInTheDocument()
  })

  it('still calls onAnnotationClick when an added annotation mark is clicked', async () => {
    const onClick = vi.fn()
    render(
      <AnnotatedText
        text={text}
        annotations={annotations}
        onAnnotationClick={onClick}
        addedAnnotationIds={new Set(['ann-1'])}
      />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    expect(onClick).toHaveBeenCalledWith(annotations[0])
  })
})
