// __tests__/components/ReviewClient.test.tsx
//
// The /review route is the conversations inbox after the Practise-as-home
// redesign. The page names its surface directly ("Your conversations" H1
// + Practise · Review · Study eyebrow) and carries no write-down reminder
// card — the bottom-nav Study tab is the only home for the "items
// waiting" signal.
//
// This suite covers:
//   • The H1 reads "Your conversations" (NOT the warm time-of-day greeting
//     — that belongs to the Practise home now).
//   • The methodology eyebrow renders with Review as the active pillar.
//   • The old DashboardReminders write-down card is gone.
//   • The Practise mode-picker doors do NOT render here.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

// Stub Link so anchors render their href synchronously (avoids the
// next/link prefetch noise inside the methodology eyebrow).
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: {
    children: React.ReactNode; href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    targetLanguage: 'es-AR',
    uiLanguage: 'en',
    t: (key: string) => {
      // Just enough strings to drive the assertions. Anything else falls
      // through to the key (matches the real t() fallback).
      const dict: Record<string, string> = {
        'review.title': 'Your conversations',
        'home.pillarSpeak': 'Speak',
        'home.pillarReview': 'Review',
        'home.pillarRefine': 'Refine',
        'home.pillarAria': 'Methodology',
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

describe('ReviewClient — methodology eyebrow', () => {
  it('renders all three pillar words (Speak · Review · Refine)', () => {
    render(<ReviewClient initialSessions={[mockSession]} />)
    expect(screen.getByText('Speak')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Refine')).toBeInTheDocument()
  })

  it('marks Review as the active pillar (aria-current="page")', () => {
    render(<ReviewClient initialSessions={[mockSession]} />)
    const reviewEl = screen.getByText('Review')
    expect(reviewEl).toHaveAttribute('aria-current', 'page')
  })

  it('Refine pillar is a plain link to /refine (no count badge) when not locked', () => {
    render(<ReviewClient initialSessions={[mockSession]} />)
    const refineLink = screen.getByText('Refine').closest('a')
    expect(refineLink).toHaveAttribute('href', '/refine')
    expect(screen.queryByTestId('home-study-chip')).not.toBeInTheDocument()
  })

  // First-time-user critique pass (2026-05): if the user has recordings
  // but hasn't saved any practice items yet, the Study pillar should
  // dashed-lock so the eyebrow stops pointing at the empty Write queue.
  // The page-level RSC derives this from loadEmptyAccountFlags and
  // hands the array in; the component just renders it.
  it('renders Refine as a locked non-link span when lockedPillars contains "refine"', () => {
    // Avoid getByLabelText — see PractiseClient test for the normalizer
    // patch gotcha (vitest.setup.ts).
    const { container } = render(
      <ReviewClient
        initialSessions={[mockSession]}
        lockedPillars={['refine']}
      />,
    )
    expect(screen.getByText('Refine').closest('a')).toBeNull()
    const refineWrapper = container.querySelector('[data-locked="true"]')
    expect(refineWrapper).not.toBeNull()
    expect(refineWrapper?.getAttribute('aria-label')).toMatch(
      /Refine — home\.pillarLockedRefine/,
    )
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
