import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoiceCoachmark } from '@/components/VoiceCoachmark'
import { LanguageProvider } from '@/components/LanguageProvider'

const STORAGE_KEY = 'cc:voice-trigger-coachmark:v1'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true })

function wrap(ui: React.ReactNode) {
  return render(<LanguageProvider initialTargetLanguage="es-AR">{ui}</LanguageProvider>)
}

describe('VoiceCoachmark', () => {
  beforeEach(() => { localStorageMock.clear() })

  it('renders on first run', () => {
    wrap(<VoiceCoachmark visible={true} />)
    expect(screen.getByText(/ask the coach anything/i)).toBeInTheDocument()
  })

  it('does not render when already dismissed in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '1')
    const { container } = wrap(<VoiceCoachmark visible={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render when visible=false', () => {
    const { container } = wrap(<VoiceCoachmark visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('dismisses on click and writes the localStorage flag', () => {
    wrap(<VoiceCoachmark visible={true} />)
    const dismiss = screen.getByRole('button', { name: /dismiss/i })
    fireEvent.click(dismiss)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1')
  })
})
