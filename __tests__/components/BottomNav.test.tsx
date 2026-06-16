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
      <BottomNav unreadCount={0} />
    </LanguageProvider>
  )
}

describe('BottomNav', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockPathname.mockReturnValue('/')
  })

  // Settings moved into the account menu; the bottom nav is now three
  // tabs: Speak → Review → Vocabulary.
  it('renders the three nav tabs (Speak, Review, Vocabulary)', () => {
    wrap()
    expect(screen.getByRole('link', { name: /speak/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /vocabulary/i })).toBeInTheDocument()
  })

  it('does NOT render a Settings tab (moved to the account menu)', () => {
    wrap()
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument()
  })

  it('marks Practise active on "/"', () => {
    mockPathname.mockReturnValue('/')
    wrap()
    expect(screen.getByRole('link', { name: /speak/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /vocabulary/i })).not.toHaveAttribute('aria-current')
  })

  it('does NOT mark Speak active on "/vocabulary" (exact match required)', () => {
    mockPathname.mockReturnValue('/vocabulary')
    wrap()
    expect(screen.getByRole('link', { name: /speak/i })).not.toHaveAttribute('aria-current')
  })

  it('marks Review active on "/review"', () => {
    mockPathname.mockReturnValue('/review')
    wrap()
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Vocabulary active on "/vocabulary"', () => {
    mockPathname.mockReturnValue('/vocabulary')
    wrap()
    expect(screen.getByRole('link', { name: /vocabulary/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Vocabulary active on a sub-route like "/vocabulary/something"', () => {
    mockPathname.mockReturnValue('/vocabulary/something')
    wrap()
    expect(screen.getByRole('link', { name: /vocabulary/i })).toHaveAttribute('aria-current', 'page')
  })

  it('hides itself on md+ viewports via the md:hidden utility', () => {
    const { container } = wrap()
    expect(container.querySelector('nav')).toHaveClass('md:hidden')
  })
})
