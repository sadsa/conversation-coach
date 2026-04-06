// __tests__/components/ConditionalNav.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConditionalNav } from '@/components/ConditionalNav'
import { ThemeProvider } from '@/components/ThemeProvider'

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
  return render(<ThemeProvider><ConditionalNav /></ThemeProvider>)
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

  it('renders the header on "/practice"', () => {
    mockPathname.mockReturnValue('/practice')
    wrap()
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })

  it('renders the header on "/sessions/abc"', () => {
    mockPathname.mockReturnValue('/sessions/abc')
    wrap()
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument()
  })
})
