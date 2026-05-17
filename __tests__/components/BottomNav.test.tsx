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

  // Tabs renamed in the Practise-as-home redesign: Recordings → Review,
  // Write → Study, plus a new Practise tab at /. Order reflects the
  // methodology: Practise → Review → Study → Settings.
  it('renders all four nav tabs (Practise, Review, Study, Settings)', () => {
    wrap()
    expect(screen.getByRole('link', { name: /practise/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /study/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('marks Practise active on "/"', () => {
    mockPathname.mockReturnValue('/')
    wrap()
    expect(screen.getByRole('link', { name: /practise/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /study/i })).not.toHaveAttribute('aria-current')
  })

  it('does NOT mark Practise active on "/write" (exact match required)', () => {
    mockPathname.mockReturnValue('/write')
    wrap()
    expect(screen.getByRole('link', { name: /practise/i })).not.toHaveAttribute('aria-current')
  })

  it('marks Review active on "/review"', () => {
    mockPathname.mockReturnValue('/review')
    wrap()
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Study active on "/write" (route name unchanged, label is "Study")', () => {
    mockPathname.mockReturnValue('/write')
    wrap()
    expect(screen.getByRole('link', { name: /study/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Study active on a sub-route like "/write/something"', () => {
    mockPathname.mockReturnValue('/write/something')
    wrap()
    expect(screen.getByRole('link', { name: /study/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Settings active on "/settings"', () => {
    mockPathname.mockReturnValue('/settings')
    wrap()
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /practise/i })).not.toHaveAttribute('aria-current')
  })

  it('hides itself on md+ viewports via the md:hidden utility', () => {
    const { container } = wrap()
    expect(container.querySelector('nav')).toHaveClass('md:hidden')
  })
})
