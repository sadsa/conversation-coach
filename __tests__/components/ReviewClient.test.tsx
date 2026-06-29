// __tests__/components/ReviewClient.test.tsx
//
// The /review route is the conversations inbox after the Practise-as-home
// redesign. The page names its surface directly ("Your conversations" H1)
// and carries no write-down reminder card — the bottom-nav Study tab is
// the only home for the "items waiting" signal.
//
// This suite covers:
//   • The H1 reads "Your conversations" (NOT the warm time-of-day greeting
//     — that belongs to the Practise home now).
//   • The old DashboardReminders write-down card is gone.
//   • The Practise mode-picker doors do NOT render here.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewClient } from '@/components/ReviewClient'
import type { SessionListItem } from '@/lib/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// SessionList renders heavy timing logic + swipe gestures that aren't
// useful to exercise here; stub it out and assert on the surrounding
// widgets instead.
vi.mock('@/components/SessionList', () => ({
  SessionList: () => <div data-testid="session-list" />,
}))

vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    targetLanguage: 'es-AR',
    uiLanguage: 'en',
    t: (key: string) => {
      const dict: Record<string, string> = {
        'review.title': 'Your conversations',
        'review.emptyLine': 'No conversations to review yet.',
        'review.emptyCta': 'Start a conversation',
        'review.filter.searchPlaceholder': 'Search sessions…',
        'review.filter.button': 'Filter',
        'review.filter.inProgress': 'In progress',
        'review.filter.readyToStudy': 'Ready to study',
        'home.recentSessionsTitle': 'Your conversations',
        'home.noRecordingsYet': 'No conversations yet.',
      }
      return dict[key] ?? key
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
  reviewed_at: null,
  review_state: null,
  saved_count: 0,
  due_count: 0,
}

beforeEach(() => {
  // Catch-all for any ambient fetches the client may make (e.g. status
  // polling). Suites below override when they care about a specific call.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  )
})

describe('ReviewClient — page header', () => {
  it('renders the "Your conversations" H1 (not the warm greeting)', () => {
    render(<ReviewClient initialSessions={[mockSession]} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Your conversations')
  })

  it('does NOT render a time-of-day greeting (Buenos días / Buenas tardes / ...)', () => {
    render(<ReviewClient initialSessions={[mockSession]} />)
    expect(screen.queryByText(/buenos\s*d[ií]as/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/buenas\s*tardes/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/buenas\s*noches/i)).not.toBeInTheDocument()
  })
})

describe('ReviewClient — surface scope', () => {
  // The old DashboardReminders card (the "X corrections to write down"
  // surface) was dropped from /review — the bottom-nav Study tab is the
  // single home for that signal now.
  it('does NOT render the DashboardReminders write-down card', () => {
    render(<ReviewClient initialSessions={[mockSession]} />)
    expect(screen.queryByTestId('widget-write-down')).not.toBeInTheDocument()
    expect(screen.queryByText(/corrections to write down/i)).not.toBeInTheDocument()
  })

  // The Practise-as-home redesign moved the mode-picker doors to `/`.
  it('does NOT render Practice CTA cards (those live on the home now)', () => {
    render(<ReviewClient initialSessions={[]} />)
    expect(screen.queryByTestId('home-mode-call')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-mode-chat')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-mode-share')).not.toBeInTheDocument()
  })

  it('does NOT render the legacy revisit-tutorial link', () => {
    render(<ReviewClient initialSessions={[]} />)
    expect(screen.queryByTestId('dashboard-onboarding')).not.toBeInTheDocument()
    expect(screen.queryByText(/revisit the tutorial/i)).not.toBeInTheDocument()
  })
})

const partialSession: SessionListItem = {
  id: 'p1',
  title: 'Grammar talk',
  status: 'ready',
  duration_seconds: 60,
  created_at: '2026-04-01T00:00:00Z',
  processing_completed_at: '2026-04-01T00:01:00Z',
  last_viewed_at: null,
  reviewed_at: null,
  review_state: 'partial',
  saved_count: 0,
  due_count: 0,
}

const readySession: SessionListItem = {
  id: 'r1',
  title: 'Ready session',
  status: 'ready',
  duration_seconds: 90,
  created_at: '2026-04-02T00:00:00Z',
  processing_completed_at: '2026-04-02T00:01:00Z',
  last_viewed_at: null,
  reviewed_at: null,
  review_state: 'ready_to_study',
  saved_count: 2,
  due_count: 1,
}

describe('ReviewClient — filter bar', () => {
  it('renders the filter bar', () => {
    render(<ReviewClient initialSessions={[mockSession]} />)
    expect(screen.getByTestId('filter-bar')).toBeDefined()
  })

  it('shows both filter options in the dropdown', async () => {
    render(<ReviewClient initialSessions={[mockSession]} />)
    await userEvent.click(screen.getByTestId('filter-dropdown-trigger'))
    expect(screen.getByTestId('filter-option-partial')).toBeDefined()
    expect(screen.getByTestId('filter-option-ready_to_study')).toBeDefined()
  })

  it('selecting a filter adds a pill', async () => {
    render(<ReviewClient initialSessions={[partialSession, readySession]} />)
    await userEvent.click(screen.getByTestId('filter-dropdown-trigger'))
    await userEvent.click(screen.getByTestId('filter-option-partial'))
    expect(screen.getByTestId('filter-pill-partial')).toBeDefined()
  })

  it('dismissing a pill removes it', async () => {
    render(<ReviewClient initialSessions={[partialSession]} />)
    await userEvent.click(screen.getByTestId('filter-dropdown-trigger'))
    await userEvent.click(screen.getByTestId('filter-option-partial'))
    await userEvent.click(screen.getByTestId('filter-pill-remove-partial'))
    expect(screen.queryByTestId('filter-pill-partial')).toBeNull()
  })

  it('applying a non-matching filter shows the empty state', async () => {
    render(<ReviewClient initialSessions={[readySession]} />)
    await userEvent.click(screen.getByTestId('filter-dropdown-trigger'))
    await userEvent.click(screen.getByTestId('filter-option-partial'))
    expect(screen.getByText('No conversations to review yet.')).toBeDefined()
  })

  it('applying a matching filter keeps the session list visible', async () => {
    render(<ReviewClient initialSessions={[partialSession, readySession]} />)
    await userEvent.click(screen.getByTestId('filter-dropdown-trigger'))
    await userEvent.click(screen.getByTestId('filter-option-partial'))
    expect(screen.getByTestId('session-list')).toBeDefined()
  })
})
