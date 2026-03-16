// __tests__/components/TranscriptView.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranscriptView } from '@/components/TranscriptView'
import type { TranscriptSegment, Annotation } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const segments: TranscriptSegment[] = [
  { id: 'seg-1', session_id: 's1', speaker: 'A', text: 'Yo fui al mercado.', start_ms: 0, end_ms: 2000, position: 0 },
  { id: 'seg-2', session_id: 's1', speaker: 'B', text: '¿Qué compraste?', start_ms: 2500, end_ms: 4000, position: 1 },
]
const annotations: Annotation[] = [
  { id: 'ann-1', session_id: 's1', segment_id: 'seg-1', type: 'grammar',
    original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.' },
]

describe('TranscriptView', () => {
  it('dims native speaker turns (speaker B when user is ["A"])', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} onAddToPractice={() => {}} />
    )
    const dimmed = container.querySelector('.opacity-40')
    expect(dimmed).toBeTruthy()
    expect(dimmed?.textContent).toContain('¿Qué compraste?')
  })

  it('does not dim any segments when userSpeakerLabels is ["A","B"]', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={[]} userSpeakerLabels={['A', 'B']} onAddToPractice={() => {}} />
    )
    expect(container.querySelector('.opacity-40')).toBeNull()
  })

  it('shows annotation card when highlight is clicked', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} onAddToPractice={() => {}} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })

  it('hides annotation card when same highlight is clicked again', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} onAddToPractice={() => {}} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('filters annotations by type', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} onAddToPractice={() => {}} />
    )
    await userEvent.click(screen.getByRole('button', { name: /natural/i }))
    expect(screen.queryByText('Yo fui')).toBeTruthy()
  })
})
