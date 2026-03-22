// __tests__/components/BottomNav.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BottomNav } from '@/components/BottomNav'

// usePathname is a Next.js hook — mock it
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

import { usePathname } from 'next/navigation'
const mockPathname = usePathname as ReturnType<typeof vi.fn>

describe('BottomNav', () => {
  it('renders four nav links including Insights', () => {
    mockPathname.mockReturnValue('/')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /practice/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /insights/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('marks Insights as active on "/insights"', () => {
    mockPathname.mockReturnValue('/insights')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /insights/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
  })

  it('marks Home as active on exact "/" match', () => {
    mockPathname.mockReturnValue('/')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /practice/i })).not.toHaveAttribute('aria-current')
  })

  it('does NOT mark Home as active on "/practice"', () => {
    mockPathname.mockReturnValue('/practice')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /practice/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Practice as active on a sub-path like "/practice/foo"', () => {
    mockPathname.mockReturnValue('/practice/foo')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /practice/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Settings as active on "/settings"', () => {
    mockPathname.mockReturnValue('/settings')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page')
  })
})
