// __tests__/components/AppHeader.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppHeader } from '@/components/AppHeader'
import { ThemeProvider } from '@/components/ThemeProvider'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
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
