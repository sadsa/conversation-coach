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

  // Speak → Review → Refine → Settings.
  it('renders all four nav tabs (Speak, Review, Refine, Settings)', () => {
    wrap()
    expect(screen.getByRole('link', { name: /speak/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /refine/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('marks Practise active on "/"', () => {
    mockPathname.mockReturnValue('/')
    wrap()
    expect(screen.getByRole('link', { name: /speak/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /refine/i })).not.toHaveAttribute('aria-current')
  })

  it('does NOT mark Speak active on "/refine" (exact match required)', () => {
    mockPathname.mockReturnValue('/refine')
    wrap()
    expect(screen.getByRole('link', { name: /speak/i })).not.toHaveAttribute('aria-current')
  })

  it('marks Review active on "/review"', () => {
    mockPathname.mockReturnValue('/review')
    wrap()
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Refine active on "/refine"', () => {
    mockPathname.mockReturnValue('/refine')
    wrap()
    expect(screen.getByRole('link', { name: /refine/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Refine active on a sub-route like "/refine/something"', () => {
    mockPathname.mockReturnValue('/refine/something')
    wrap()
    expect(screen.getByRole('link', { name: /refine/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Settings active on "/settings"', () => {
    mockPathname.mockReturnValue('/settings')
    wrap()
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /speak/i })).not.toHaveAttribute('aria-current')
  })

  it('hides itself on md+ viewports via the md:hidden utility', () => {
    const { container } = wrap()
    expect(container.querySelector('nav')).toHaveClass('md:hidden')
  })
})
