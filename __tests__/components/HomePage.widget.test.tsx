// __tests__/components/HomePage.widget.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import HomePage from '@/app/page'

// Minimal mocks for the page's other dependencies
vi.mock('@/components/DropZone', () => ({
  DropZone: () => <div data-testid="drop-zone" />,
}))
vi.mock('@/components/PendingUploadCard', () => ({
  PendingUploadCard: () => <div />,
}))
vi.mock('@/components/SessionList', () => ({
  SessionList: () => <div data-testid="session-list" />,
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (key === 'home.cardsDue') return `${vars?.n} cards due`
      if (key === 'home.toWriteDown') return `${vars?.n} to write down`
      return key
    },
  }),
}))

beforeEach(() => {
  // jsdom provides localStorage but stub it in case the environment strips it
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    })
  }

  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/dashboard-summary') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ dueCount: 4, writeDownCount: 3, nextReviewAt: null }),
      })
    }
    if (url === '/api/sessions') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  }))
})

describe('HomePage — widget', () => {
  it('renders the write-down pill after summary loads', async () => {
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('3 to write down')).toBeInTheDocument()
    })
  })

  it('write-down pill links to /practice?written_down=false', async () => {
    render(<HomePage />)
    await waitFor(() => {
      const writeLink = screen.getByText('3 to write down').closest('a')
      expect(writeLink).toHaveAttribute('href', '/practice?written_down=false')
    })
  })

  it('shows placeholder dashes while loading', () => {
    render(<HomePage />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows 0 to write down when writeDownCount is 0', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/dashboard-summary') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ writeDownCount: 0 }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }))
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('0 to write down')).toBeInTheDocument()
    })
  })
})
