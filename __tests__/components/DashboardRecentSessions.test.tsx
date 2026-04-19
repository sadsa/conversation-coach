// __tests__/components/DashboardRecentSessions.test.tsx
//
// Verifies the bucket-grouping layer that sits above SessionList. SessionList
// itself is mocked here so the test stays focused on bucketing logic — date
// formatting and row rendering are covered by SessionList.test.tsx.
//
// The Unread/All filter that used to live above the list was removed as
// part of /distill: read state is now carried entirely by font weight + tone
// on each row, so we only test grouping + show-more here.

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
      }
      if (key === 'home.recentShowAll') return `Show all ${vars?.n}`
      return map[key] ?? key
    },
  }),
}))

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

  it('hides the bucket header when only one bucket is populated', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    // All in "today" — a lone "TODAY" stripe would just be visual noise.
    const sessions: SessionListItem[] = [
      makeSession('today-1', localISO(2026, 4, 18, 10)),
      makeSession('today-2', localISO(2026, 4, 18, 9)),
    ]

    render(<DashboardRecentSessions sessions={sessions} />)

    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
    expect(screen.getByTestId('row-today-1')).toBeInTheDocument()
    expect(screen.getByTestId('row-today-2')).toBeInTheDocument()
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

  it('shows every session — there is no Unread/All filter', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    // Mix of read and unread — both must render.
    const sessions: SessionListItem[] = [
      makeSession('unread-1', localISO(2026, 4, 18, 10), 'unread-1', null),
      makeSession('read-1',   localISO(2026, 4, 17, 10)),
    ]

    render(<DashboardRecentSessions sessions={sessions} />)

    expect(screen.getByTestId('row-unread-1')).toBeInTheDocument()
    expect(screen.getByTestId('row-read-1')).toBeInTheDocument()
    // No filter pills should be present.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
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
