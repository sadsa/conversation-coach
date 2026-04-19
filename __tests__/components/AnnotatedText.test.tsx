// __tests__/components/AnnotatedText.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotatedText } from '@/components/AnnotatedText'
import type { Annotation } from '@/lib/types'

const text = 'Yo fui al mercado.'
const annotation: Annotation = {
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
  flashcard_front: null,
  flashcard_back: null,
  flashcard_note: null,
  importance_score: null,
  importance_note: null,
  is_unhelpful: false,
  unhelpful_at: null,
}

describe('AnnotatedText', () => {
  it('renders plain text when no annotations', () => {
    render(<AnnotatedText text={text} annotations={[]} onAnnotationClick={() => {}} />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('renders a highlighted mark for the annotated phrase', () => {
    render(<AnnotatedText text={text} annotations={[annotation]} onAnnotationClick={() => {}} />)
    expect(screen.getByText('Yo fui').tagName).toBe('MARK')
  })

  it('calls onAnnotationClick when mark is clicked', async () => {
    const onClick = vi.fn()
    render(<AnnotatedText text={text} annotations={[annotation]} onAnnotationClick={onClick} />)
    await userEvent.click(screen.getByText('Yo fui'))
    expect(onClick).toHaveBeenCalledWith(annotation)
  })

  it('renders text before and after the highlight', () => {
    render(<AnnotatedText text={text} annotations={[annotation]} onAnnotationClick={() => {}} />)
    expect(screen.getByText(' al mercado.')).toBeInTheDocument()
  })

  it('applies unreviewed style when not in savedAnnotationIds or writtenAnnotationIds', () => {
    render(<AnnotatedText text={text} annotations={[annotation]} onAnnotationClick={() => {}} />)
    const mark = screen.getByText('Yo fui')
    expect(mark).toHaveClass('annotation-unreviewed')
  })

  it('applies saved style when annotation is in savedAnnotationIds', () => {
    render(
      <AnnotatedText
        text={text}
        annotations={[annotation]}
        onAnnotationClick={() => {}}
        savedAnnotationIds={new Set(['ann-1'])}
      />
    )
    expect(screen.getByText('Yo fui')).toHaveClass('annotation-saved')
  })

  it('applies written style when annotation is in writtenAnnotationIds', () => {
    render(
      <AnnotatedText
        text={text}
        annotations={[annotation]}
        onAnnotationClick={() => {}}
        savedAnnotationIds={new Set(['ann-1'])}
        writtenAnnotationIds={new Set(['ann-1'])}
      />
    )
    expect(screen.getByText('Yo fui')).toHaveClass('annotation-written')
  })

  it('written style takes priority over saved style', () => {
    render(
      <AnnotatedText
        text={text}
        annotations={[annotation]}
        onAnnotationClick={() => {}}
        savedAnnotationIds={new Set(['ann-1'])}
        writtenAnnotationIds={new Set(['ann-1'])}
      />
    )
    const mark = screen.getByText('Yo fui')
    expect(mark).toHaveClass('annotation-written')
    expect(mark).not.toHaveClass('annotation-saved')
  })

  it('mutes the highlight when annotation is in unhelpfulAnnotationIds', () => {
    render(
      <AnnotatedText
        text={text}
        annotations={[annotation]}
        onAnnotationClick={() => {}}
        // Even though it's "saved", the unhelpful flag wins visually so the
        // user's "this isn't useful" decision is respected during scanning.
        savedAnnotationIds={new Set(['ann-1'])}
        unhelpfulAnnotationIds={new Set(['ann-1'])}
      />,
    )
    const mark = screen.getByText('Yo fui')
    expect(mark).toHaveAttribute('data-unhelpful', 'true')
    expect(mark).not.toHaveClass('annotation-saved')
    // The state glyph (★/✓) should not render alongside an unhelpful mark.
    expect(mark.querySelector('span[aria-hidden="true"]')).toBeNull()
  })

  it('explicitly clears the user-agent <mark> background for unhelpful (regression)', () => {
    // <mark> ships with a default solid-yellow background. If we forget the
    // bg-transparent override, an unhelpful mark renders louder than every
    // other state — exactly the opposite of "muted". Lock that in.
    render(
      <AnnotatedText
        text={text}
        annotations={[annotation]}
        onAnnotationClick={() => {}}
        unhelpfulAnnotationIds={new Set(['ann-1'])}
      />,
    )
    const mark = screen.getByText('Yo fui')
    expect(mark).toHaveClass('bg-transparent')
    expect(mark).not.toHaveClass('annotation-active')
    expect(mark).not.toHaveClass('annotation-unreviewed')
  })

  it('still calls onAnnotationClick on a saved annotation', async () => {
    const onClick = vi.fn()
    render(
      <AnnotatedText
        text={text}
        annotations={[annotation]}
        onAnnotationClick={onClick}
        savedAnnotationIds={new Set(['ann-1'])}
      />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    expect(onClick).toHaveBeenCalledWith(annotation)
  })
})
