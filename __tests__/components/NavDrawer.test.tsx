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
    const { container } = render(<NavDrawer isOpen={false} onClose={onClose} />)
    expect(container.querySelector('#nav-drawer')).toHaveClass('-translate-x-full')
  })

  it('is on-screen when isOpen is true', () => {
    const { container } = render(<NavDrawer isOpen={true} onClose={onClose} />)
    expect(container.querySelector('#nav-drawer')).toHaveClass('translate-x-0')
  })

  it('renders all four nav links', () => {
    render(<NavDrawer isOpen={true} onClose={onClose} />)
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /practice/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /insights/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('marks the current route with aria-current="page"', () => {
    mockPathname.mockReturnValue('/practice')
    render(<NavDrawer isOpen={true} onClose={onClose} />)
    expect(screen.getByRole('link', { name: /practice/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
  })

  it('does NOT mark Home active on "/practice"', () => {
    mockPathname.mockReturnValue('/practice')
    render(<NavDrawer isOpen={true} onClose={onClose} />)
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
  })

  it('marks Home active on exact "/"', () => {
    mockPathname.mockReturnValue('/')
    render(<NavDrawer isOpen={true} onClose={onClose} />)
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page')
  })

  it('calls onClose when the close button is clicked', async () => {
    render(<NavDrawer isOpen={true} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /close menu/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const { container } = render(<NavDrawer isOpen={true} onClose={onClose} />)
    await userEvent.click(container.querySelector('[data-testid="nav-backdrop"]')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when a nav link is clicked', async () => {
    render(<NavDrawer isOpen={true} onClose={onClose} />)
    await userEvent.click(screen.getByRole('link', { name: /practice/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape is pressed while open', async () => {
    render(<NavDrawer isOpen={true} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT call onClose on Escape when drawer is closed', async () => {
    render(<NavDrawer isOpen={false} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('adds overflow-hidden to body when open', () => {
    render(<NavDrawer isOpen={true} onClose={onClose} />)
    expect(document.body).toHaveClass('overflow-hidden')
  })

  it('removes overflow-hidden from body when closed', () => {
    const { rerender } = render(<NavDrawer isOpen={true} onClose={onClose} />)
    rerender(<NavDrawer isOpen={false} onClose={onClose} />)
    expect(document.body).not.toHaveClass('overflow-hidden')
  })

  it('renders a sign-out button', () => {
    render(<NavDrawer isOpen={true} onClose={onClose} />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('signs out, closes drawer, and redirects on sign-out click', async () => {
    render(<NavDrawer isOpen={true} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/login')
  })
})
