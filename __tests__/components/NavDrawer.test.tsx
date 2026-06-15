// __tests__/components/NavDrawer.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NavDrawer } from '@/components/NavDrawer'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}))
const mockSignOut = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signOut: mockSignOut },
  }),
}))

import { usePathname, useRouter } from 'next/navigation'
const mockPathname = usePathname as ReturnType<typeof vi.fn>
const mockUseRouter = useRouter as ReturnType<typeof vi.fn>

const user = { name: 'Joshua', email: 'joshua.b@entelect.co.nz', avatarUrl: null }

function renderDrawer(isOpen: boolean, onClose = vi.fn()) {
  return render(
    <NavDrawer isOpen={isOpen} onClose={onClose} unreviewedCount={0} user={user} />
  )
}

describe('NavDrawer', () => {
  const mockPush = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
    mockPathname.mockReturnValue('/')
    mockUseRouter.mockReturnValue({ push: mockPush })
  })

  it('is off-screen when isOpen is false', () => {
    const { container } = renderDrawer(false, onClose)
    expect(container.querySelector('#nav-drawer')).toHaveClass('-translate-x-full')
  })

  it('is on-screen when isOpen is true', () => {
    const { container } = renderDrawer(true, onClose)
    expect(container.querySelector('#nav-drawer')).toHaveClass('translate-x-0')
  })

  // Settings was moved into the account menu, so the nav list is now three
  // pillars: Speak → Review → Refine.
  it('renders the three pillar nav links (Speak, Review, Refine)', () => {
    renderDrawer(true, onClose)
    expect(screen.getByRole('link', { name: /speak/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /refine/i })).toBeInTheDocument()
  })

  it('does NOT render a Settings nav link (moved to the account menu)', () => {
    renderDrawer(true, onClose)
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument()
  })

  it('marks the current route with aria-current="page"', () => {
    mockPathname.mockReturnValue('/refine')
    renderDrawer(true, onClose)
    expect(screen.getByRole('link', { name: /refine/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /speak/i })).not.toHaveAttribute('aria-current')
  })

  it('does NOT mark Speak active on "/refine" (exact match required)', () => {
    mockPathname.mockReturnValue('/refine')
    renderDrawer(true, onClose)
    expect(screen.getByRole('link', { name: /speak/i })).not.toHaveAttribute('aria-current')
  })

  it('marks Speak active on exact "/"', () => {
    mockPathname.mockReturnValue('/')
    renderDrawer(true, onClose)
    expect(screen.getByRole('link', { name: /speak/i })).toHaveAttribute('aria-current', 'page')
  })

  it('calls onClose when the close button is clicked', async () => {
    renderDrawer(true, onClose)
    await userEvent.click(screen.getByRole('button', { name: /close menu/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const { container } = renderDrawer(true, onClose)
    await userEvent.click(container.querySelector('[data-testid="nav-backdrop"]')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when a nav link is clicked', async () => {
    renderDrawer(true, onClose)
    await userEvent.click(screen.getByRole('link', { name: /refine/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape is pressed while open', async () => {
    renderDrawer(true, onClose)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT call onClose on Escape when drawer is closed', async () => {
    renderDrawer(false, onClose)
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('adds overflow-hidden to body when open', () => {
    renderDrawer(true, onClose)
    expect(document.body).toHaveClass('overflow-hidden')
  })

  it('removes overflow-hidden from body when closed', () => {
    const onClose2 = vi.fn()
    const { rerender } = renderDrawer(true, onClose2)
    rerender(<NavDrawer isOpen={false} onClose={onClose2} unreviewedCount={0} user={user} />)
    expect(document.body).not.toHaveClass('overflow-hidden')
  })

  it('renders the account row with the user identity', () => {
    renderDrawer(true, onClose)
    expect(screen.getByRole('button', { name: /joshua/i })).toBeInTheDocument()
  })

  it('reveals Settings and Sign out only after opening the account menu', async () => {
    renderDrawer(true, onClose)
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /joshua/i }))
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
  })

  it('signs out, closes drawer, and redirects on sign-out click', async () => {
    renderDrawer(true, onClose)
    await userEvent.click(screen.getByRole('button', { name: /joshua/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/login')
  })
})
