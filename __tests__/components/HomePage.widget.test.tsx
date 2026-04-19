// __tests__/components/HomePage.widget.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomePage from '@/app/page'
import { stashAutoRead } from '@/lib/auto-read-toast'

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
      // Inline only the keys this widget exercises so the assertions below
      // can be plain English strings rather than i18n keys.
      if (key === 'home.toWriteDown') return `${vars?.n} corrections to write down`
      if (key === 'home.toWriteDownOne') return '1 correction to write down'
      if (key === 'home.allCaughtUp') return 'All caught up — nothing to write down right now.'
      if (key === 'home.remindersAria') return 'Saved corrections'
      if (key === 'session.autoReadToast') return `Marked "${vars?.title}" as read.`
      if (key === 'session.undo') return 'Undo'
      if (key === 'session.undoError') return "Couldn't undo — try again."
      return key
    },
  }),
}))

// Test-friendly sessionStorage so the auto-read stash works in JSDOM. We
// stub it once at module scope (rather than inside beforeEach) because the
// HomePage's mount-time effect reads sessionStorage synchronously before
// any test code can intervene.
const sessionStorageStub = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
    key: () => null,
    length: 0,
  }
})()
vi.stubGlobal('sessionStorage', sessionStorageStub)

// One realistic, terminal-state session — needed so the dashboard renders
// the returning-user view (with the reminders card) instead of the
// first-time onboarding empty state.
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
  sessionStorageStub.clear()
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
    // The skeleton renders synchronously on first paint, before any fetch
    // resolves — useful as a pre-data signal for screen-readers (aria-busy)
    // and to prevent layout jump.
    expect(screen.getByTestId('dashboard-reminders-loading')).toBeInTheDocument()
  })

  describe('auto-read undo toast', () => {
    afterEach(() => {
      sessionStorageStub.clear()
    })

    it('does NOT show a toast when there is no pending stash', async () => {
      render(<HomePage />)
      await waitFor(() => {
        expect(screen.getByText('3 corrections to write down')).toBeInTheDocument()
      })
      expect(screen.queryByText(/marked .* as read/i)).not.toBeInTheDocument()
    })

    it('surfaces the undo toast when a stash is pending', async () => {
      stashAutoRead('s1', 'Test session')
      render(<HomePage />)
      await waitFor(() => {
        expect(screen.getByText('Marked "Test session" as read.')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    })

    it('clears the stash so a refresh does not re-show the toast', async () => {
      stashAutoRead('s1', 'Test session')
      const { unmount } = render(<HomePage />)
      await waitFor(() => {
        expect(screen.getByText('Marked "Test session" as read.')).toBeInTheDocument()
      })
      unmount()
      // Second mount: stash should have been consumed; no toast.
      render(<HomePage />)
      await waitFor(() => {
        expect(screen.getByText('3 corrections to write down')).toBeInTheDocument()
      })
      expect(screen.queryByText(/marked .* as read/i)).not.toBeInTheDocument()
    })

    it('PATCHes { read: false } and dismisses the toast on Undo', async () => {
      stashAutoRead('s1', 'Test session')
      render(<HomePage />)
      const undo = await screen.findByRole('button', { name: 'Undo' })
      await userEvent.click(undo)
      // The PATCH goes out with read: false…
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/sessions/s1', expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ read: false }),
        }))
      })
      // …and the toast is dismissed immediately on click (no waiting around).
      expect(screen.queryByText(/marked .* as read/i)).not.toBeInTheDocument()
    })
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
    // No CTA when there's nothing to do.
    expect(screen.queryByTestId('widget-write-down')).not.toBeInTheDocument()
  })
})
