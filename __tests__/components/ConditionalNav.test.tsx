// __tests__/components/ConditionalNav.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConditionalNav } from '@/components/ConditionalNav'
import { LanguageProvider } from '@/components/LanguageProvider'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}))
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  }),
}))

import { usePathname, useRouter } from 'next/navigation'
const mockPathname = usePathname as ReturnType<typeof vi.fn>
const mockUseRouter = useRouter as ReturnType<typeof vi.fn>

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

const user = { name: 'Joshua', email: 'joshua.b@entelect.co.nz', avatarUrl: null }

function wrap() {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <ConditionalNav unreviewedCount={0} user={user} />
    </LanguageProvider>
  )
}

describe('ConditionalNav', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseRouter.mockReturnValue({ push: vi.fn() })
    localStorageMock.clear()
  })

  it.each(['/login', '/login/verify', '/access-denied', '/onboarding'])(
    'renders nothing on %s',
    (path) => {
      mockPathname.mockReturnValue(path)
      const { container } = wrap()
      expect(container.firstChild).toBeNull()
    }
  )

  it('renders the account options button on "/"', () => {
    mockPathname.mockReturnValue('/')
    wrap()
    expect(screen.getByRole('button', { name: /account options/i })).toBeInTheDocument()
  })

  it('renders the account options button on "/vocabulary"', () => {
    mockPathname.mockReturnValue('/vocabulary')
    wrap()
    expect(screen.getByRole('button', { name: /account options/i })).toBeInTheDocument()
  })

  it('renders the account options button on "/sessions/abc"', () => {
    mockPathname.mockReturnValue('/sessions/abc')
    wrap()
    expect(screen.getByRole('button', { name: /account options/i })).toBeInTheDocument()
  })

  it('renders the bottom nav on "/"', () => {
    mockPathname.mockReturnValue('/')
    wrap()
    expect(screen.getAllByRole('navigation', { name: /quick navigation/i }).length).toBeGreaterThan(0)
  })

  it('does not render the bottom nav on "/login"', () => {
    mockPathname.mockReturnValue('/login')
    const { container } = wrap()
    expect(container.firstChild).toBeNull()
  })
})
