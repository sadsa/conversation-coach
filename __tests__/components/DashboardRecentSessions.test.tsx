// __tests__/components/DashboardRecentSessions.test.tsx
//
// Verifies the show-more/fewer cap layer that sits above SessionList.
// SessionList itself is mocked — date formatting and row rendering are
// covered by SessionList.test.tsx.
//
// Bucket grouping was removed in a layout pass: date context now lives
// top-right on each row (Drive/Gmail pattern), so no h3 headers appear.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardRecentSessions } from '@/components/DashboardRecentSessions'
import type { SessionListItem } from '@/lib/types'

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
        'home.recentShowFewer': 'Show fewer',
      }
      if (key === 'home.recentShowAll') return `Show all ${vars?.n}`
      return map[key] ?? key
    },
  }),
}))

function makeSession(
  id: string,
  createdAt = '2026-04-18T10:00:00Z',
  lastViewedAt: string | null = '2026-04-18T00:00:00Z',
): SessionListItem {
  return {
    id,
    title: id,
    status: 'ready',
    duration_seconds: 60,
    created_at: createdAt,
    processing_completed_at: null,
    last_viewed_at: lastViewedAt,
  }
}

describe('DashboardRecentSessions', () => {
  it('renders all sessions in a flat list — no bucket h3 headers', () => {
    const sessions = [
      makeSession('a', '2026-04-18T10:00:00Z'),
      makeSession('b', '2026-04-17T10:00:00Z'),
      makeSession('c', '2026-04-12T10:00:00Z'),
      makeSession('d', '2026-03-01T10:00:00Z'),
    ]

    render(<DashboardRecentSessions sessions={sessions} />)

    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
    expect(screen.getByTestId('row-a')).toBeInTheDocument()
    expect(screen.getByTestId('row-b')).toBeInTheDocument()
    expect(screen.getByTestId('row-c')).toBeInTheDocument()
    expect(screen.getByTestId('row-d')).toBeInTheDocument()
  })

  it('shows every session — there is no Unread/All filter', () => {
    const sessions = [
      makeSession('unread-1', '2026-04-18T10:00:00Z', null),
      makeSession('read-1',   '2026-04-17T10:00:00Z'),
    ]

    render(<DashboardRecentSessions sessions={sessions} />)

    expect(screen.getByTestId('row-unread-1')).toBeInTheDocument()
    expect(screen.getByTestId('row-read-1')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('caps the visible window to 5 by default and exposes a Show-all toggle', async () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      makeSession(`s-${i}`, `2026-04-18T${String(10 - i).padStart(2, '0')}:00:00Z`),
    )

    render(<DashboardRecentSessions sessions={sessions} />)

    expect(screen.getAllByTestId(/^row-s-/)).toHaveLength(5)

    await userEvent.click(screen.getByRole('button', { name: 'Show all 7' }))

    expect(screen.getAllByTestId(/^row-s-/)).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument()
  })

  it('collapses back to 5 when Show fewer is clicked', async () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      makeSession(`s-${i}`, `2026-04-18T${String(10 - i).padStart(2, '0')}:00:00Z`),
    )

    render(<DashboardRecentSessions sessions={sessions} />)

    await userEvent.click(screen.getByRole('button', { name: 'Show all 7' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }))

    expect(screen.getAllByTestId(/^row-s-/)).toHaveLength(5)
  })

  it('hides the show-all toggle when sessions fit within the cap', () => {
    const sessions = Array.from({ length: 3 }, (_, i) =>
      makeSession(`s-${i}`),
    )

    render(<DashboardRecentSessions sessions={sessions} />)

    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument()
  })
})
