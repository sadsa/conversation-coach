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

  it('renders a busy spinner when state is connecting', () => {
    wrap(<VoiceTrigger state="connecting" onStart={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
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
