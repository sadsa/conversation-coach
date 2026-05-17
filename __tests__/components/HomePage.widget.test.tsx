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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  // HomeClient reads the `welcome` query param on mount to drive the
  // peak-end welcome beat. The widget tests don't exercise that beat,
  // so the stub returns null for every key.
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock('@/components/SessionList', () => ({
  SessionList: () => <div data-testid="session-list" />,
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    targetLanguage: 'es-AR',
    uiLanguage: 'en',
    t: (key: string, vars?: Record<string, unknown>) => {
      if (key === 'home.toWriteDown') return `${vars?.n} corrections to write down`
      if (key === 'home.toWriteDownOne') return '1 correction to write down'
      if (key === 'home.allCaughtUp') return 'All caught up — nothing to write down right now.'
      if (key === 'home.remindersAria') return 'Saved corrections'
      if (key === 'home.dashboardSubtitle') return ''
      if (key === 'home.firstRunSubtitle') return 'Practice by chatting — or share a recording from WhatsApp.'
      if (key === 'home.practiceCTATitle') return 'Practice with your coach'
      if (key === 'home.practiceCTASubtitle') return `Start a 5-minute voice session in ${vars?.language ?? 'Spanish'}`
      if (key === 'home.shareCTA') return 'Already recorded a voice note? Show me how'
      if (key === 'lang.es-AR') return 'Spanish'
      if (key === 'home.noRecordingsYet') return 'No recordings yet — share audio from WhatsApp to get started.'
      if (key === 'home.recentSessionsTitle') return 'Recordings'
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

describe('HomeClient — Share CTA (subtle alt path under Practice)', () => {
  // The Share CTA replaces both the onboarding hub and the
  // DashboardOnboarding "Revisit tutorial" link. It always renders
  // (not just first-run) so users coming back to the dashboard still
  // have an obvious path to the share-from-WhatsApp tutorial.
  it('always renders, regardless of how many sessions the user has', () => {
    render(<HomeClient initialSessions={[mockSession]} initialSummary={{ writeDownCount: 0 }} />)
    expect(screen.getByTestId('home-share-cta')).toBeInTheDocument()
  })

  it('also renders on first-run (no sessions at all)', () => {
    render(<HomeClient initialSessions={[]} initialSummary={null} />)
    expect(screen.getByTestId('home-share-cta')).toBeInTheDocument()
  })

  it('links to the share illustration step of the tutorial', () => {
    render(<HomeClient initialSessions={[]} initialSummary={null} />)
    expect(screen.getByTestId('home-share-cta')).toHaveAttribute('href', '/onboarding?step=2')
  })

  it('uses the home.shareCTA copy (not a hub-era key)', () => {
    render(<HomeClient initialSessions={[]} initialSummary={null} />)
    expect(screen.getByText(/already recorded a voice note/i)).toBeInTheDocument()
  })
})

describe('HomeClient — DashboardOnboarding removed', () => {
  // The DashboardOnboarding component's "Revisit the tutorial" text link
  // was retired alongside the hub — the Share CTA above covers the only
  // remaining tutorial surface.
  it('does NOT render the legacy revisit-tutorial link', () => {
    render(<HomeClient initialSessions={[]} initialSummary={null} />)
    expect(screen.queryByTestId('dashboard-onboarding')).not.toBeInTheDocument()
    expect(screen.queryByText(/revisit the tutorial/i)).not.toBeInTheDocument()
  })
})

