// __tests__/components/VoiceTrigger.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoiceTrigger } from '@/components/VoiceTrigger'
import { LanguageProvider } from '@/components/LanguageProvider'

function wrap(ui: React.ReactNode) {
  return render(
    <LanguageProvider initialTargetLanguage="en-NZ">
      {ui}
    </LanguageProvider>
  )
}

describe('VoiceTrigger', () => {
  it('renders a mic button when state is idle', () => {
    wrap(<VoiceTrigger state="idle" onStart={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /iniciar conversación de voz/i })
    expect(btn).toBeInTheDocument()
    expect(btn).not.toBeDisabled()
    expect(btn).not.toHaveAttribute('aria-busy', 'true')
  })

  it('uses an accent-tinted inner circle so it reads as a primary affordance', () => {
    // The bolder pass swapped the neutral surface fill for accent-chip so
    // the eye doesn't group the trigger with the theme toggle next to it.
    wrap(<VoiceTrigger state="idle" onStart={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /iniciar conversación de voz/i })
    const inner = btn.querySelector('span')
    expect(inner?.className).toMatch(/bg-accent-chip/)
    expect(inner?.className).toMatch(/text-on-accent-chip/)
  })

  it('renders a busy spinner when state is connecting', () => {
    wrap(<VoiceTrigger state="connecting" onStart={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('shows a visible "Connecting…" label and announces via aria-live when connecting', () => {
    wrap(<VoiceTrigger state="connecting" onStart={vi.fn()} />)
    // The visible label sits inside the button (desktop only via Tailwind
    // responsive utilities — JSDOM still mounts the node).
    expect(screen.getAllByText(/conectando/i).length).toBeGreaterThanOrEqual(1)
    // Polite live region carries the connecting announcement so SR users
    // get the same status the spinner conveys to sighted users.
    const live = screen.getByText(/conectando con el coach de voz/i)
    expect(live).toHaveAttribute('aria-live', 'polite')
  })

  it('does NOT announce connecting when state is idle (live region empty)', () => {
    const { container } = wrap(<VoiceTrigger state="idle" onStart={vi.fn()} />)
    const live = container.querySelector('[aria-live="polite"]')
    expect(live?.textContent ?? '').toBe('')
  })

  it('renders nothing when state is active', () => {
    const { container } = wrap(<VoiceTrigger state="active" onStart={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when state is muted', () => {
    const { container } = wrap(<VoiceTrigger state="muted" onStart={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('calls onStart when clicked in idle state', () => {
    const onStart = vi.fn()
    wrap(<VoiceTrigger state="idle" onStart={onStart} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('does not call onStart when clicked in connecting state', () => {
    const onStart = vi.fn()
    wrap(<VoiceTrigger state="connecting" onStart={onStart} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onStart).not.toHaveBeenCalled()
  })
})
