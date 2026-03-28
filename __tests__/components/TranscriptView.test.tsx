// __tests__/components/TranscriptView.test.tsx
import { describe, it, expect, vi } from 'vitest'
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
    sub_category: 'other' },
]

const defaultProps = {
  sessionId: 's1',
  addedAnnotations: new Map<string, string>(),
  onAnnotationAdded: vi.fn(),
  onAnnotationRemoved: vi.fn(),
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

  it('shows the added badge on a highlight when the annotation id is in addedAnnotations', () => {
    render(
      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={['A']}
        sessionId="s1"
        addedAnnotations={new Map([['ann-1', 'pi-1']])}
        onAnnotationAdded={vi.fn()}
        onAnnotationRemoved={vi.fn()}
      />
    )
    expect(screen.getByTestId('annotation-added-badge-ann-1')).toBeInTheDocument()
  })
})
