// __tests__/components/HomePage.widget.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import HomePage from '@/app/page'

vi.mock('@/components/SessionList', () => ({
  SessionList: () => <div data-testid="session-list" />,
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (key === 'home.toWriteDown') return `${vars?.n} corrections to write down`
      if (key === 'home.toWriteDownOne') return '1 correction to write down'
      if (key === 'home.allCaughtUp') return 'All caught up — nothing to write down right now.'
      if (key === 'home.remindersAria') return 'Saved corrections'
      if (key === 'home.greetingEmoji') return '🎧'
      if (key === 'home.greetingMorning') return 'Good morning'
      if (key === 'home.greetingAfternoon') return 'Good afternoon'
      if (key === 'home.greetingEvening') return 'Good evening'
      if (key === 'home.dashboardSubtitle') return 'Subtitle'
      if (key === 'home.uploadFabAria') return 'Upload a new conversation'
      if (key === 'home.uploadFabLabel') return 'Upload'
      return key
    },
  }),
}))

const mockSession = {
  id: 's1',
  title: 'Test session',
  status: 'ready' as const,
  duration_seconds: 60,
  created_at: '2026-04-01T00:00:00Z',
  processing_completed_at: '2026-04-01T00:01:00Z',
  last_viewed_at: '2026-04-01T00:05:00Z',
}

beforeEach(() => {
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
        json: () => Promise.resolve({ writeDownCount: 3 }),
      })
    }
    if (url === '/api/sessions') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([mockSession]) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  }))
})

describe('HomePage — widget', () => {
  it('renders the reminders CTA after summary loads (plural copy)', async () => {
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('3 corrections to write down')).toBeInTheDocument()
    })
  })

  it('reminders CTA links to /write', async () => {
    render(<HomePage />)
    await waitFor(() => {
      const writeLink = screen.getByText('3 corrections to write down').closest('a')
      expect(writeLink).toHaveAttribute('href', '/write')
    })
  })

  it('uses singular copy when there is exactly 1 correction', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/dashboard-summary') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ writeDownCount: 1 }),
        })
      }
      if (url === '/api/sessions') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockSession]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }))
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('1 correction to write down')).toBeInTheDocument()
    })
  })

  it('shows a calm skeleton while summary is loading', () => {
    render(<HomePage />)
    expect(screen.getByTestId('dashboard-reminders-loading')).toBeInTheDocument()
  })

  it('does not show an auto-read toast (feature removed)', async () => {
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText('3 corrections to write down')).toBeInTheDocument()
    })
    expect(screen.queryByText(/marked .* as read/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('shows the all-caught-up line (no card, no CTA) when nothing is pending', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/dashboard-summary') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ writeDownCount: 0 }),
        })
      }
      if (url === '/api/sessions') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockSession]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }))
    render(<HomePage />)
    await waitFor(() => {
      expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('widget-write-down')).not.toBeInTheDocument()
  })
})
