// __tests__/components/AppHeader.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { ThemeProvider } from '@/components/ThemeProvider'
import { LanguageProvider } from '@/components/LanguageProvider'

let mockPathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

function wrap(isOpen: boolean, onOpen = vi.fn()) {
  return render(
    <ThemeProvider>
      <AppHeader isOpen={isOpen} onOpen={onOpen} />
    </ThemeProvider>
  )
}

describe('AppHeader', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.resetAllMocks()
    mockPathname = '/'
  })

  it('renders the open menu button', () => {
    wrap(false)
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })

  it('calls onOpen when the hamburger is clicked', async () => {
    const onOpen = vi.fn()
    wrap(false, onOpen)
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('sets aria-expanded="false" when isOpen is false', () => {
    wrap(false)
    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('sets aria-expanded="true" when isOpen is true', () => {
    wrap(true)
    expect(screen.getByRole('button', { name: /open menu/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows "Switch to light mode" button in dark mode (default)', () => {
    wrap(false)
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument()
  })

  it('shows "Switch to dark mode" button after switching to light', async () => {
    wrap(false)
    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }))
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument()
  })

  it('switches back to dark from light', async () => {
    wrap(false)
    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }))
    await userEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }))
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument()
  })
})

afterEach(cleanup)

function wrapWithLang(ui: ReactNode) {
  return render(
    <ThemeProvider>
      <LanguageProvider initialTargetLanguage="es-AR">
        {ui}
      </LanguageProvider>
    </ThemeProvider>
  )
}

describe('AppHeader voice trigger', () => {
  beforeEach(() => {
    localStorageMock.clear()
    mockPathname = '/write'
  })

  it('renders the voice trigger when voice prop is provided', () => {
    wrapWithLang(
      <AppHeader
        isOpen={false}
        onOpen={vi.fn()}
        voice={{ state: 'idle', onStart: vi.fn() }}
      />
    )
    expect(screen.getByRole('button', { name: /start voice conversation/i })).toBeInTheDocument()
  })

  it('omits the voice trigger when voice prop is missing', () => {
    wrapWithLang(<AppHeader isOpen={false} onOpen={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /start voice conversation/i })).toBeNull()
  })

  it('hides the section label when voice state is active', () => {
    wrapWithLang(
      <AppHeader
        isOpen={false}
        onOpen={vi.fn()}
        voice={{ state: 'active', onStart: vi.fn() }}
      />
    )
    // /write route would normally show "Write" — confirm it's gone.
    expect(screen.queryByText(/^write$/i)).toBeNull()
  })

  it('shows the section label when voice state is idle', () => {
    wrapWithLang(
      <AppHeader
        isOpen={false}
        onOpen={vi.fn()}
        voice={{ state: 'idle', onStart: vi.fn() }}
      />
    )
    expect(screen.getByText(/^write$/i)).toBeInTheDocument()
  })
})
