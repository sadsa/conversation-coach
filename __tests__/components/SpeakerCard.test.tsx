// __tests__/components/SpeakerCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpeakerCard } from '@/components/SpeakerCard'

const samples = ['Che, ¿cómo andás?', 'No sé bien.']

describe('SpeakerCard', () => {
  it('renders speaker label and sample text', () => {
    render(<SpeakerCard label="A" samples={samples} onToggle={vi.fn()} selected={false} disabled={false} />)
    expect(screen.getByText(/speaker a/i)).toBeInTheDocument()
    expect(screen.getByText(/che/i)).toBeInTheDocument()
  })

  it('calls onToggle with the label when clicked', async () => {
    const onToggle = vi.fn()
    render(<SpeakerCard label="A" samples={samples} onToggle={onToggle} selected={false} disabled={false} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledWith('A')
  })

  it('shows a checkmark when selected', () => {
    const { container } = render(
      <SpeakerCard label="A" samples={samples} onToggle={vi.fn()} selected={true} disabled={false} />
    )
    // Selected card should have a visual indicator — a checkmark element
    expect(container.querySelector('[data-testid="checkmark"]')).toBeInTheDocument()
  })

  it('does not call onToggle when disabled', async () => {
    const onToggle = vi.fn()
    render(<SpeakerCard label="A" samples={samples} onToggle={onToggle} selected={false} disabled={true} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
