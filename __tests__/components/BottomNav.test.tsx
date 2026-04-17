// __tests__/components/BottomNav.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BottomNav } from '@/components/BottomNav'
import { LanguageProvider } from '@/components/LanguageProvider'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

import { usePathname } from 'next/navigation'
const mockPathname = usePathname as ReturnType<typeof vi.fn>

function wrap() {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <BottomNav />
    </LanguageProvider>
  )
}

describe('BottomNav', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockPathname.mockReturnValue('/')
  })

  it('renders all four nav tabs', () => {
    wrap()
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /practice/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /insights/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('marks Home active on "/"', () => {
    mockPathname.mockReturnValue('/')
    wrap()
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /practice/i })).not.toHaveAttribute('aria-current')
  })

  it('does NOT mark Home active on "/practice"', () => {
    mockPathname.mockReturnValue('/practice')
    wrap()
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
  })

  it('marks Practice active on "/practice"', () => {
    mockPathname.mockReturnValue('/practice')
    wrap()
    expect(screen.getByRole('link', { name: /practice/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Practice active on a sub-route like "/practice/something"', () => {
    mockPathname.mockReturnValue('/practice/something')
    wrap()
    expect(screen.getByRole('link', { name: /practice/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Settings active on "/settings"', () => {
    mockPathname.mockReturnValue('/settings')
    wrap()
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
  })

  it('hides itself on md+ viewports via the md:hidden utility', () => {
    const { container } = wrap()
    expect(container.querySelector('nav')).toHaveClass('md:hidden')
  })
})
