// __tests__/components/AccountMenu.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountMenuMobileHeader, AccountMenuDesktop, AccountWidget } from '@/components/AccountMenu'
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

describe('AccountMenuMobileHeader', () => {
  it('renders the three-dot trigger, menu collapsed by default', () => {
    withProvider(<AccountMenuMobileHeader />)
    const trigger = screen.getByRole('button', { name: /account options/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('toggles the menu open, exposing Settings and Sign out', async () => {
    withProvider(<AccountMenuMobileHeader />)
    await userEvent.click(screen.getByRole('button', { name: /account options/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /settings/i })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
  })

  it('closes the menu on Escape', async () => {
    withProvider(<AccountMenuMobileHeader />)
    await userEvent.click(screen.getByRole('button', { name: /account options/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('signs out and routes to /login', async () => {
    withProvider(<AccountMenuMobileHeader />)
    await userEvent.click(screen.getByRole('button', { name: /account options/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(mockPush).toHaveBeenCalledWith('/login')
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

describe('AccountWidget', () => {
  it('shows name and email when both are present', () => {
    const { container } = withProvider(
      <AccountWidget user={{ name: 'Joshua', email: 'joshua.b@entelect.co.nz', avatarUrl: null }} />
    )
    expect(container).toHaveTextContent('Joshua')
    expect(container).toHaveTextContent('joshua.b@entelect.co.nz')
  })

  it('shows only email when name is absent', () => {
    const { container } = withProvider(
      <AccountWidget user={{ name: null, email: 'nameless@example.com', avatarUrl: null }} />
    )
    expect(container).toHaveTextContent('nameless@example.com')
  })
})
