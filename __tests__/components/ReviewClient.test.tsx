// __tests__/components/ReviewClient.test.tsx
//
// Covers the /review inbox:
//   • H1 is "Your conversations" (not the warm home greeting)
//   • Legacy surfaces (write-down card, mode-picker) are gone
//   • Two tabs: "Needs review" (open) and "Reviewed"
//   • Default tab shows sessions with reviewed_at === null
//   • Reviewed tab shows sessions with reviewed_at set
//   • Search bar present on the open tab

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewClient } from '@/components/ReviewClient'
import type { SessionListItem } from '@/lib/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/components/SessionList', () => ({
  SessionList: () => <div data-testid="session-list" />,
}))

vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    targetLanguage: 'es-AR',
    uiLanguage: 'en',
    t: (key: string, replacements?: Record<string, string | number>) => {
      const dict: Record<string, string> = {
        'review.title': 'Your conversations',
        'review.emptyLine': 'No conversations to review yet.',
        'review.emptyCta': 'Start a conversation',
        'review.filter.searchPlaceholder': 'Search sessions…',
        'review.filter.button': 'Filter',
        'review.tab.open': 'Needs review',
        'review.tab.reviewed': 'Reviewed',
        'review.tab.reviewedEmpty': 'Nothing reviewed yet.',
        'review.search.noneHere': 'No matches here.',
        'review.search.seeOther': 'See {count} in {tab}',
        'review.search.noMatches': 'Nothing matches “{query}”.',
        'home.recentSessionsTitle': 'Your conversations',
        'home.noRecordingsYet': 'No conversations yet.',
      }
      const template = dict[key] ?? key
      if (!replacements) return template
      return template.replace(/\{(\w+)\}/g, (_, k) => String(replacements[k] ?? ''))
    },
  }),
}))

function makeSession(overrides: Partial<SessionListItem> & { id: string }): SessionListItem {
  return {
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
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  )
})

describe('ReviewClient — page header', () => {
  it('renders the "Your conversations" H1', () => {
    render(<ReviewClient initialSessions={[makeSession({ id: 's1' })]} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your conversations')
  })

  it('does NOT render a time-of-day greeting', () => {
    render(<ReviewClient initialSessions={[makeSession({ id: 's1' })]} />)
    expect(screen.queryByText(/buenos\s*d[ií]as/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/buenas\s*tardes/i)).not.toBeInTheDocument()
  })
})

describe('ReviewClient — surface scope', () => {
  it('does NOT render the DashboardReminders write-down card', () => {
    render(<ReviewClient initialSessions={[makeSession({ id: 's1' })]} />)
    expect(screen.queryByTestId('widget-write-down')).not.toBeInTheDocument()
  })

  it('does NOT render Practice CTA cards', () => {
    render(<ReviewClient initialSessions={[]} />)
    expect(screen.queryByTestId('home-mode-call')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-mode-chat')).not.toBeInTheDocument()
  })
})

describe('ReviewClient — tabs', () => {
  it('renders Needs review and Reviewed tabs', () => {
    render(<ReviewClient initialSessions={[makeSession({ id: 's1' })]} />)
    expect(screen.getByTestId('tab-open')).toBeDefined()
    expect(screen.getByTestId('tab-reviewed')).toBeDefined()
  })

  it('shows open sessions in Needs review tab by default', () => {
    const openSession = makeSession({ id: 's1', reviewed_at: null })
    render(<ReviewClient initialSessions={[openSession]} />)
    expect(screen.getByTestId('session-list')).toBeDefined()
  })

  it('shows count badge on Needs review tab when sessions exist', () => {
    render(<ReviewClient initialSessions={[makeSession({ id: 's1' })]} />)
    expect(screen.getByTestId('tab-open-count')).toHaveTextContent('1')
  })

  it('shows empty state when no open sessions exist', () => {
    const reviewed = makeSession({ id: 's1', reviewed_at: '2026-04-01T10:00:00Z' })
    render(<ReviewClient initialSessions={[reviewed]} />)
    expect(screen.getByText('No conversations to review yet.')).toBeDefined()
  })

  it('switches to Reviewed tab and shows reviewed sessions', async () => {
    const reviewed = makeSession({ id: 's1', reviewed_at: '2026-04-01T10:00:00Z' })
    render(<ReviewClient initialSessions={[reviewed]} />)
    await userEvent.click(screen.getByTestId('tab-reviewed'))
    expect(screen.getByTestId('session-list')).toBeDefined()
  })

  it('shows empty state on Reviewed tab when no reviewed sessions', async () => {
    render(<ReviewClient initialSessions={[makeSession({ id: 's1' })]} />)
    await userEvent.click(screen.getByTestId('tab-reviewed'))
    expect(screen.getByText('Nothing reviewed yet.')).toBeDefined()
  })
})

describe('ReviewClient — search bar', () => {
  it('renders the search bar regardless of active tab', async () => {
    const reviewed = makeSession({ id: 's1', reviewed_at: '2026-04-01T10:00:00Z' })
    render(<ReviewClient initialSessions={[reviewed]} />)
    expect(screen.getByTestId('filter-bar')).toBeDefined()
    await userEvent.click(screen.getByTestId('tab-reviewed'))
    expect(screen.getByTestId('filter-bar')).toBeDefined()
  })

  it('does not show filter chips (no filter options)', () => {
    render(<ReviewClient initialSessions={[makeSession({ id: 's1' })]} />)
    expect(screen.queryByTestId('filter-dropdown-trigger')).not.toBeInTheDocument()
  })
})

describe('ReviewClient — dual-pool search', () => {
  it('shows a count badge on both tabs', () => {
    const open = makeSession({ id: 's1', title: 'Hola', reviewed_at: null })
    const reviewed = makeSession({ id: 's2', title: 'Chau', reviewed_at: '2026-04-01T10:00:00Z' })
    render(<ReviewClient initialSessions={[open, reviewed]} />)
    expect(screen.getByTestId('tab-open-count')).toHaveTextContent('1')
    expect(screen.getByTestId('tab-reviewed-count')).toHaveTextContent('1')
  })

  it('updates both badge counts as the query narrows each pool', async () => {
    const open = makeSession({ id: 's1', title: 'Hola mundo', reviewed_at: null })
    const reviewed = makeSession({ id: 's2', title: 'Chau amigo', reviewed_at: '2026-04-01T10:00:00Z' })
    render(<ReviewClient initialSessions={[open, reviewed]} />)
    await userEvent.type(screen.getByTestId('filter-search-input'), 'chau')
    expect(screen.getByTestId('tab-open-count')).toHaveTextContent('0')
    expect(screen.getByTestId('tab-reviewed-count')).toHaveTextContent('1')
  })

  it('offers to switch tabs when the match lives in the other pool', async () => {
    const open = makeSession({ id: 's1', title: 'Hola mundo', reviewed_at: null })
    const reviewed = makeSession({ id: 's2', title: 'Chau amigo', reviewed_at: '2026-04-01T10:00:00Z' })
    render(<ReviewClient initialSessions={[open, reviewed]} />)
    await userEvent.type(screen.getByTestId('filter-search-input'), 'chau')
    const recovery = screen.getByTestId('search-see-other')
    expect(recovery).toHaveTextContent('See 1 in Reviewed')
    await userEvent.click(recovery)
    expect(screen.getByTestId('session-list')).toBeDefined()
  })

  it('shows a no-matches line when nothing matches in either pool', async () => {
    const open = makeSession({ id: 's1', title: 'Hola mundo', reviewed_at: null })
    render(<ReviewClient initialSessions={[open]} />)
    await userEvent.type(screen.getByTestId('filter-search-input'), 'zzz')
    expect(screen.getByTestId('search-no-matches')).toBeDefined()
  })
})
