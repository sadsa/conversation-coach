// __tests__/components/AppHeader.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppHeader } from '@/components/AppHeader'
import { LanguageProvider } from '@/components/LanguageProvider'

let mockPathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  }),
}))

const user = { name: 'Joshua', email: 'joshua.b@entelect.co.nz', avatarUrl: null }

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
    <LanguageProvider initialTargetLanguage="es-AR">
      <AppHeader isOpen={isOpen} onOpen={onOpen} user={user} />
    </LanguageProvider>
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
})

afterEach(cleanup)
