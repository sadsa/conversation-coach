// __tests__/components/DashboardRecentSessions.test.tsx
//
// Verifies the bucket-grouping layer that sits above SessionList. SessionList
// itself is mocked here so the test stays focused on bucketing logic — date
// formatting and row rendering are covered by SessionList.test.tsx.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardRecentSessions } from '@/components/DashboardRecentSessions'
import type { SessionListItem } from '@/lib/types'

// Stub SessionList so each rendered list reports its session ids in DOM order.
// Keeps assertions simple: we can read off the ids per bucket.
vi.mock('@/components/SessionList', () => ({
  SessionList: ({ sessions }: { sessions: SessionListItem[] }) => (
    <ul data-testid="session-list">
      {sessions.map(s => (
        <li key={s.id} data-testid={`row-${s.id}`}>{s.title}</li>
      ))}
    </ul>
  ),
}))

vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'home.recentSessionsTitle': 'Recent conversations',
        'home.recentBucketToday': 'Today',
        'home.recentBucketYesterday': 'Yesterday',
        'home.recentBucketThisWeek': 'This week',
        'home.recentBucketEarlier': 'Earlier',
        'home.recentShowFewer': 'Show fewer',
        'home.recentFilterUnread': 'Unread',
        'home.recentFilterAll': 'All',
        'home.recentFilterAria': 'Filter recent conversations',
        'home.recentAllCaughtUpTitle': 'All caught up',
        'home.recentAllCaughtUpBody': 'You\'ve reviewed every recent session.',
        'home.recentAllCaughtUpShowAll': 'Show all',
      }
      if (key === 'home.recentShowAll') return `Show all ${vars?.n}`
      if (key === 'home.recentUnreadCount') return `${vars?.n}`
      return map[key] ?? key
    },
  }),
}))

// Stub localStorage so filter persistence is deterministic across tests.
const localStorageStub = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
  }
})()
vi.stubGlobal('localStorage', localStorageStub)

// Pin "now" so the bucketing math is deterministic regardless of when the
// test runs. We construct dates from local components (not UTC strings) so
// the wall-clock day matches the test runner's timezone — bucketFor uses
// local getters under the hood, so a UTC-pinned date can drift into the
// wrong bucket when the test machine is east or west of the prime meridian.
function localISO(year: number, month: number, day: number, h = 12): string {
  return new Date(year, month - 1, day, h, 0, 0).toISOString()
}

const NOW = new Date(2026, 3, 18, 14, 0, 0) // April 18, 2026 at 14:00 LOCAL

function makeSession(
  id: string,
  createdAt: string,
  title = id,
  // Default to "already viewed" so existing tests behave like before the
  // inbox feature: filter defaults to All, every row is visible.
  lastViewedAt: string | null = '2026-04-18T00:00:00Z',
): SessionListItem {
  return {
    id,
    title,
    status: 'ready',
    duration_seconds: 60,
    created_at: createdAt,
    processing_completed_at: null,
    last_viewed_at: lastViewedAt,
  }
}

afterEach(() => {
  vi.useRealTimers()
  localStorageStub.clear()
})

describe('DashboardRecentSessions — bucket grouping', () => {
  it('renders bucket headers in the canonical order (Today → Earlier)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const sessions: SessionListItem[] = [
      makeSession('today-1',     localISO(2026, 4, 18, 10)),
      makeSession('yesterday-1', localISO(2026, 4, 17, 10)),
      makeSession('thisweek-1',  localISO(2026, 4, 15, 10)),
      makeSession('earlier-1',   localISO(2026, 3, 1, 10)),
    ]

    render(<DashboardRecentSessions sessions={sessions} />)

    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map(h => h.textContent)
    expect(headings).toEqual(['Today', 'Yesterday', 'This week', 'Earlier'])
  })

  it('omits a bucket header when no session falls into it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    // Only today + earlier — yesterday and this-week buckets must not render.
    const sessions: SessionListItem[] = [
      makeSession('today-1',   localISO(2026, 4, 18, 10)),
      makeSession('earlier-1', localISO(2026, 3, 1, 10)),
    ]

    render(<DashboardRecentSessions sessions={sessions} />)

    expect(screen.getByRole('heading', { level: 3, name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Earlier' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Yesterday' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'This week' })).not.toBeInTheDocument()
  })

  it('places each session in the correct bucket', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const sessions: SessionListItem[] = [
      makeSession('today-1',     localISO(2026, 4, 18, 10)),
      makeSession('today-2',     localISO(2026, 4, 18, 8)),
      makeSession('yesterday-1', localISO(2026, 4, 17, 10)),
      makeSession('thisweek-1',  localISO(2026, 4, 15, 10)),
    ]

    render(<DashboardRecentSessions sessions={sessions} />)

    const lists = screen.getAllByTestId('session-list')
    // Three buckets present (today, yesterday, this week), so three lists.
    expect(lists).toHaveLength(3)

    expect(within(lists[0]).getByTestId('row-today-1')).toBeInTheDocument()
    expect(within(lists[0]).getByTestId('row-today-2')).toBeInTheDocument()
    expect(within(lists[1]).getByTestId('row-yesterday-1')).toBeInTheDocument()
    expect(within(lists[2]).getByTestId('row-thisweek-1')).toBeInTheDocument()
  })

  it('defaults to All filter and shows every session when nothing is unread', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    // makeSession defaults last_viewed_at to a non-null timestamp, so all
    // four rows are "read" → unreadCount === 0 → filter defaults to "all".
    const sessions: SessionListItem[] = [
      makeSession('today-1',     localISO(2026, 4, 18, 10)),
      makeSession('yesterday-1', localISO(2026, 4, 17, 10)),
    ]

    render(<DashboardRecentSessions sessions={sessions} />)

    expect(screen.getByRole('tab', { name: /All/, selected: true })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Unread/, selected: false })).toBeInTheDocument()
    expect(screen.getByTestId('row-today-1')).toBeInTheDocument()
  })

  it('defaults to Unread filter when there is unread mail', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const sessions: SessionListItem[] = [
      makeSession('unread-1', localISO(2026, 4, 18, 10), 'unread-1', null),
      makeSession('read-1',   localISO(2026, 4, 17, 10)),
    ]

    render(<DashboardRecentSessions sessions={sessions} />)

    expect(screen.getByRole('tab', { name: /Unread/, selected: true })).toBeInTheDocument()
    // Unread filter is active → only unread row is rendered.
    expect(screen.getByTestId('row-unread-1')).toBeInTheDocument()
    expect(screen.queryByTestId('row-read-1')).not.toBeInTheDocument()
  })

  it('shows the All-caught-up empty state when Unread filter has no rows', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    // Force the Unread filter even though everything is already read, by
    // pre-populating the persisted choice.
    localStorageStub.setItem('recentSessionsFilter', 'unread')

    const sessions: SessionListItem[] = [
      makeSession('today-1', localISO(2026, 4, 18, 10)),
    ]

    render(<DashboardRecentSessions sessions={sessions} />)

    expect(screen.getByTestId('recent-sessions-all-caught-up')).toBeInTheDocument()
    // The empty state offers a one-tap escape to All.
    vi.useRealTimers()
    await userEvent.click(screen.getByRole('button', { name: /Show all/i }))
    expect(screen.queryByTestId('recent-sessions-all-caught-up')).not.toBeInTheDocument()
    expect(screen.getByTestId('row-today-1')).toBeInTheDocument()
  })

  it('caps the visible window to 5 by default and exposes a Show-all toggle', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    // Seven today-sessions — more than the default visible cap of 5.
    const sessions: SessionListItem[] = Array.from({ length: 7 }, (_, i) =>
      makeSession(`today-${i}`, localISO(2026, 4, 18, 10 - i)),
    )

    render(<DashboardRecentSessions sessions={sessions} />)

    // Default: 5 of 7 rows visible.
    expect(screen.getAllByTestId(/^row-today-/)).toHaveLength(5)

    const toggle = screen.getByRole('button', { name: 'Show all 7' })
    // Switch off fake timers so userEvent's internal scheduling can run.
    vi.useRealTimers()
    await userEvent.click(toggle)

    expect(screen.getAllByTestId(/^row-today-/)).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument()
  })
})
