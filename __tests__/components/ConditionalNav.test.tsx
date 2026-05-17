// __tests__/components/ConditionalNav.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConditionalNav } from '@/components/ConditionalNav'
import { ThemeProvider } from '@/components/ThemeProvider'
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

function wrap() {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <ThemeProvider><ConditionalNav /></ThemeProvider>
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

  it('renders the header on "/"', () => {
    mockPathname.mockReturnValue('/')
    wrap()
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })

  it('renders the header on "/write"', () => {
    mockPathname.mockReturnValue('/write')
    wrap()
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })

  it('renders the header on "/sessions/abc"', () => {
    mockPathname.mockReturnValue('/sessions/abc')
    wrap()
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })

  it('renders the bottom nav on "/"', () => {
    mockPathname.mockReturnValue('/')
    wrap()
    // Both AppHeader (desktop inline nav) and BottomNav (mobile thumb-zone)
    // carry the "Quick navigation" aria-label; jsdom doesn't honour the
    // responsive utility classes that hide one of them at a time on real
    // viewports. Assert at least one nav with that name is in the DOM,
    // which is the actual contract — getAllByRole tolerates the desktop
    // duplicate during the test.
    expect(screen.getAllByRole('navigation', { name: /quick navigation/i }).length).toBeGreaterThan(0)
  })

  it('does not render the bottom nav on "/login"', () => {
    mockPathname.mockReturnValue('/login')
    const { container } = wrap()
    expect(container.firstChild).toBeNull()
  })
})
