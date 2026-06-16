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

function wrap() {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <AppHeader user={user} />
    </LanguageProvider>
  )
}

describe('AppHeader', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.resetAllMocks()
    mockPathname = '/'
  })

  it('renders the account options button', () => {
    wrap()
    expect(screen.getByRole('button', { name: /account options/i })).toBeInTheDocument()
  })

  it('opens the account menu on click, exposing Settings and Sign out', async () => {
    wrap()
    await userEvent.click(screen.getByRole('button', { name: /account options/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
  })

  it('does NOT render a back link on "/"', () => {
    mockPathname = '/'
    wrap()
    expect(screen.queryByRole('link', { name: /back/i })).not.toBeInTheDocument()
  })

  it('renders a back link on session sub-routes', () => {
    mockPathname = '/sessions/abc'
    wrap()
    expect(screen.getByRole('link', { name: /back/i })).toBeInTheDocument()
  })
})

afterEach(cleanup)
