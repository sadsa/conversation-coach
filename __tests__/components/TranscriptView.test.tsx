// __tests__/components/TranscriptView.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranscriptView } from '@/components/TranscriptView'
import type { TranscriptSegment, Annotation } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)

const segments: TranscriptSegment[] = [
  { id: 'seg-1', session_id: 's1', speaker: 'A', text: 'Yo fui al mercado.', start_ms: 0, end_ms: 2000, position: 0 },
  { id: 'seg-2', session_id: 's1', speaker: 'B', text: '¿Qué compraste?', start_ms: 2500, end_ms: 4000, position: 1 },
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

beforeEach(() => {
  localStorage.clear()
})

describe('TranscriptView', () => {
  it('auto-opens the first correction by default', () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
    expect(screen.getByText('1 of 1')).toBeInTheDocument()
  })

  it('does not auto-open when the setting is disabled', () => {
    localStorage.setItem('cc:review:auto-open-first-correction:v1', '0')
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('does not re-open automatically after the user closes the sheet', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('dims native speaker turns (speaker B when user is A)', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    const dimmed = container.querySelector('.opacity-40')
    expect(dimmed).toBeTruthy()
    expect(dimmed?.textContent).toContain('¿Qué compraste?')
  })

  it('shows modal with annotation content when highlight is clicked', async () => {
    localStorage.setItem('cc:review:auto-open-first-correction:v1', '0')
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    await userEvent.click(screen.getByRole('button', { name: /open correction/i }))
    // Explanation is rendered inside AnnotationCard inside the Modal
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
    // Modal close button should be present
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('closes modal when X button is clicked', async () => {
    localStorage.setItem('cc:review:auto-open-first-correction:v1', '0')
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    await userEvent.click(screen.getByRole('button', { name: /open correction/i }))
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
    const { container } = render(
      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={['A']}
        {...defaultProps}
        addedAnnotations={new Map([['ann-1', 'pi-1']])}
      />
    )
    const mark = container.querySelector('mark[data-annotation-id="ann-1"]')
    expect(mark).toHaveClass('annotation-saved')
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
