// __tests__/components/TranscriptView.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranscriptView } from '@/components/TranscriptView'
import type { TranscriptSegment, Annotation } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)

const segments: TranscriptSegment[] = [
  { id: 'seg-1', session_id: 's1', speaker: 'A', text: 'Yo fui al mercado.', start_ms: 0, end_ms: 2000, position: 0, paragraph_breaks: [] },
  { id: 'seg-2', session_id: 's1', speaker: 'B', text: '¿Qué compraste?', start_ms: 2500, end_ms: 4000, position: 1, paragraph_breaks: [] },
]
const annotations: Annotation[] = [
  { id: 'ann-1', session_id: 's1', segment_id: 'seg-1', type: 'grammar',
    original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.',
    sub_category: 'other', flashcard_front: null, flashcard_back: null, flashcard_note: null,
    importance_score: null, importance_note: null,
    is_unhelpful: false, unhelpful_at: null },
]

const defaultProps = {
  sessionId: 's1',
  addedAnnotations: new Map<string, string>(),
  writtenAnnotations: new Set<string>(),
  unhelpfulAnnotations: new Set<string>(),
  onAnnotationAdded: vi.fn(),
  onAnnotationRemoved: vi.fn(),
  onAnnotationWritten: vi.fn(),
  onAnnotationUnwritten: vi.fn(),
  onAnnotationUnhelpfulChanged: vi.fn(),
}

describe('TranscriptView', () => {
  it('dims native speaker turns (speaker B when user is A)', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    const dimmed = container.querySelector('.opacity-40')
    expect(dimmed).toBeTruthy()
    expect(dimmed?.textContent).toContain('¿Qué compraste?')
  })

  it('shows modal with annotation content when highlight is clicked', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    // Explanation is rendered inside AnnotationCard inside the Modal
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
    // Modal close button should be present
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('closes modal when X button is clicked', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('renders speaker label as a stacked paragraph above segment text', () => {
    render(
      <TranscriptView segments={segments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />
    )
    const label = screen.getByText('You')
    expect(label.tagName).toBe('P')
    expect(label).toHaveClass('uppercase')
  })

  it('applies saved class to a highlight when annotation is in addedAnnotations', () => {
    render(
      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={['A']}
        {...defaultProps}
        addedAnnotations={new Map([['ann-1', 'pi-1']])}
      />
    )
    expect(screen.getByText('Yo fui')).toHaveClass('annotation-saved')
  })

  it('passes writtenAnnotationIds to AnnotatedText so written annotations get written style', () => {
    const { container } = render(
      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={['A']}
        {...defaultProps}
        writtenAnnotations={new Set(['ann-1'])}
      />
    )
    const mark = container.querySelector('mark')
    expect(mark).toHaveClass('annotation-written')
  })
})

describe('TranscriptView paragraph rendering', () => {
  it('renders a single <p> when paragraph_breaks is empty (legacy)', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />,
    )
    // Speaker label is also a <p>, so we filter to ones that contain segment text.
    const paragraphs = Array.from(container.querySelectorAll('p')).filter(p =>
      p.textContent?.includes('Yo fui al mercado.'),
    )
    expect(paragraphs).toHaveLength(1)
  })

  it('renders one <p> per paragraph when paragraph_breaks is populated', () => {
    const longText = 'Primera parte aquí. Segunda parte aquí. Tercera parte aquí.'
    // 'Segunda parte aquí.' starts at index 20.
    // 'Tercera parte aquí.' starts at index 40.
    const longSegments: TranscriptSegment[] = [
      { id: 'seg-long', session_id: 's1', speaker: 'A', text: longText,
        start_ms: 0, end_ms: 5000, position: 0, paragraph_breaks: [20, 40] },
    ]
    const { container } = render(
      <TranscriptView segments={longSegments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />,
    )
    const paragraphs = Array.from(container.querySelectorAll('p')).filter(p => {
      const text = p.textContent ?? ''
      return text.includes('parte aquí.') && !text.includes('You')
    })
    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[0].textContent).toContain('Primera parte aquí.')
    expect(paragraphs[1].textContent).toContain('Segunda parte aquí.')
    expect(paragraphs[2].textContent).toContain('Tercera parte aquí.')
  })

  it('renders an annotation that lives in the second paragraph with rebased offsets', async () => {
    const longText = 'Primera parte aquí. Yo fui al mercado.'
    // 'Yo fui al mercado.' starts at index 20.
    // The "Yo fui" annotation has segment-relative offsets 20..26.
    const longSegments: TranscriptSegment[] = [
      { id: 'seg-2p', session_id: 's1', speaker: 'A', text: longText,
        start_ms: 0, end_ms: 4000, position: 0, paragraph_breaks: [20] },
    ]
    const para2Annotations: Annotation[] = [
      { id: 'ann-p2', session_id: 's1', segment_id: 'seg-2p', type: 'grammar',
        original: 'Yo fui', start_char: 20, end_char: 26, correction: 'Fui',
        explanation: 'Drop pronoun.', sub_category: 'other',
        flashcard_front: null, flashcard_back: null, flashcard_note: null,
        importance_score: null, importance_note: null,
        is_unhelpful: false, unhelpful_at: null },
    ]
    render(
      <TranscriptView
        segments={longSegments}
        annotations={para2Annotations}
        userSpeakerLabels={['A']}
        {...defaultProps}
      />,
    )
    // The annotated phrase still renders as a <mark>, and clicking it still
    // opens the AnnotationSheet (proves the rebasing didn't break navigation).
    const mark = screen.getByText('Yo fui')
    expect(mark.tagName).toBe('MARK')
    await userEvent.click(mark)
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })
})
