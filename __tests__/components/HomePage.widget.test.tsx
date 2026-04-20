// __tests__/components/HomePage.widget.test.tsx
//
// HomeClient now receives its initial data as props from the parent
// Server Component (`app/page.tsx`), so these widget tests render the
// client component directly with synthetic props. The fetch mock only
// needs to cover the side-channel calls (status polling, post-upload
// list refresh) that fire after hydration.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HomeClient } from '@/components/HomeClient'
import type { SessionListItem } from '@/lib/types'

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
      if (key === 'home.greetingMorning') return 'Good morning'
      if (key === 'home.greetingAfternoon') return 'Good afternoon'
      if (key === 'home.greetingEvening') return 'Good evening'
      if (key === 'home.dashboardSubtitle') return 'Subtitle'
      if (key === 'home.uploadFabAria') return 'Upload audio'
      if (key === 'home.uploadFabLabel') return 'Upload audio'
      return key
    },
  }),
}))

const mockSession: SessionListItem = {
  id: 's1',
  title: 'Test session',
  status: 'ready',
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
  // Catch-all for the ambient fetches the client may still make
  // (e.g. share-target pickup, post-upload refresh). Tests below
  // override this when they care about a specific call.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })))
})

describe('HomeClient — reminders widget', () => {
  it('renders the reminders CTA from initialSummary (plural copy)', () => {
    render(
      <HomeClient
        initialSessions={[mockSession]}
        initialSummary={{ writeDownCount: 3 }}
      />
    )
    expect(screen.getByText('3 corrections to write down')).toBeInTheDocument()
  })

  it('reminders CTA links to /write', () => {
    render(
      <HomeClient
        initialSessions={[mockSession]}
        initialSummary={{ writeDownCount: 3 }}
      />
    )
    const writeLink = screen.getByText('3 corrections to write down').closest('a')
    expect(writeLink).toHaveAttribute('href', '/write')
  })

  it('uses singular copy when there is exactly 1 correction', () => {
    render(
      <HomeClient
        initialSessions={[mockSession]}
        initialSummary={{ writeDownCount: 1 }}
      />
    )
    expect(screen.getByText('1 correction to write down')).toBeInTheDocument()
  })

  it('shows the calm skeleton when initialSummary is null (server fetch failed)', () => {
    render(
      <HomeClient
        initialSessions={[mockSession]}
        initialSummary={null}
      />
    )
    expect(screen.getByTestId('dashboard-reminders-loading')).toBeInTheDocument()
  })

  it('does not show an auto-read toast (feature removed)', () => {
    render(
      <HomeClient
        initialSessions={[mockSession]}
        initialSummary={{ writeDownCount: 3 }}
      />
    )
    expect(screen.queryByText(/marked .* as read/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('shows the all-caught-up line (no card, no CTA) when nothing is pending', () => {
    render(
      <HomeClient
        initialSessions={[mockSession]}
        initialSummary={{ writeDownCount: 0 }}
      />
    )
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
    expect(screen.queryByTestId('widget-write-down')).not.toBeInTheDocument()
  })
})
