// __tests__/components/AccountMenu.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountMenuMobile, AccountMenuDesktop } from '@/components/AccountMenu'
import { LanguageProvider } from '@/components/LanguageProvider'

const mockPush = vi.fn()
const mockSignOut = vi.fn().mockResolvedValue({ error: null })
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({ auth: { signOut: mockSignOut } }),
}))

function withProvider(node: React.ReactNode) {
  return render(<LanguageProvider initialTargetLanguage="es-AR">{node}</LanguageProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AccountMenuMobile', () => {
  const user = { name: 'Joshua', email: 'joshua.b@entelect.co.nz', avatarUrl: null }

  it('shows name and email on the trigger, menu collapsed by default', () => {
    withProvider(<AccountMenuMobile user={user} onNavigate={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /joshua/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('toggles the popover open, exposing Settings and Sign out', async () => {
    withProvider(<AccountMenuMobile user={user} onNavigate={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /joshua/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /settings/i })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
  })

  it('signs out and routes to /login', async () => {
    const onNavigate = vi.fn()
    withProvider(<AccountMenuMobile user={user} onNavigate={onNavigate} />)
    await userEvent.click(screen.getByRole('button', { name: /joshua/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(onNavigate).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/login')
  })

  it('falls back to email as the primary label when there is no name', () => {
    withProvider(
      <AccountMenuMobile
        user={{ name: null, email: 'nameless@example.com', avatarUrl: null }}
        onNavigate={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /nameless@example\.com/i })).toBeInTheDocument()
  })
})

describe('AccountMenuDesktop', () => {
  const user = { name: 'Joshua', email: 'joshua.b@entelect.co.nz', avatarUrl: null }

  it('opens the dropdown and closes on Escape', async () => {
    withProvider(<AccountMenuDesktop user={user} />)
    const trigger = screen.getByRole('button', { name: /account menu/i })
    await userEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders an avatar image when an avatarUrl is provided', () => {
    const { container } = withProvider(
      <AccountMenuDesktop
        user={{ ...user, avatarUrl: 'https://lh3.googleusercontent.com/a/photo' }}
      />
    )
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/photo')
    expect(img).toHaveAttribute('referrerPolicy', 'no-referrer')
  })
})
