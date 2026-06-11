// __tests__/components/PractiseClient.test.tsx
//
// The Practise-as-home redesign moved the methodology entry point to `/`.
// This suite covers the new home:
//
//   • Renders two live-practice doors: Free flow (primary) + Real Life
//     Scenario (secondary). The Share/upload door was moved to the Review
//     step (ADR 0002) — it no longer appears here.
//   • Free flow is rendered first (primary position) and shows conversation
//     starter chip buttons.
//   • Clicking a starter chip starts a chat session with that topic.
//   • Both doors are in-place `<button>`s (they mount <PracticeClient> on
//     tap — the standalone /practice route was retired so discard returns
//     to these doors).
//   • Renders the Speak · Review · Refine eyebrow with Speak as the
//     active pillar and the other two as plain links to their routes.
//   • Picks up a pending share-target file from IndexedDB and routes
//     straight to the per-session status screen before the R2 PUT
//     resolves (parity with the previous HomeClient share pickup).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PractiseClient } from '@/components/PractiseClient'

// ── Router mock ──────────────────────────────────────────────────────────
const mockPush = vi.fn()
const mockReplace = vi.fn()
const searchParamsStore = new Map<string, string>()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => searchParamsStore.get(key) ?? null,
  }),
}))

// ── Component dependencies — keep the surface area focused ────────────────
vi.mock('@/components/Icon', () => ({ Icon: () => null }))
// PracticeClient is heavy (WebSocket, audio) — stub it so chip-click tests
// can assert on mount without triggering the real session connect flow.
vi.mock('@/components/PracticeClient', () => ({
  PracticeClient: ({ starterTopic }: { starterTopic?: string }) => (
    <div data-testid="practice-client" data-starter={starterTopic ?? ''} />
  ),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: {
    children: React.ReactNode; href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      // Just enough strings to drive the assertions. Anything else falls
      // through to the key (matches the real t() fallback behaviour).
      const dict: Record<string, string> = {
        'practice.modeCallTitle': 'Real Life Scenario',
        'practice.modeCallBlurb': 'Someone new calls.',
        'practice.modeChatTitle': 'Free flow',
        'practice.modeChatBlurb': "The Coach opens and you talk about whatever's on your mind.",
        'practice.startersLabel': 'Need a topic?',
        'practice.chatStarter.0': 'Your weekend plans',
        'practice.chatStarter.1': 'A recent meal',
        'practice.chatStarter.2': 'Getting around the city',
        'home.pillarSpeak': 'Speak',
        'home.pillarReview': 'Review',
        'home.pillarRefine': 'Refine',
        'home.pillarAria': 'Methodology',
        'home.welcomeBeat': 'All set. Ready when you are.',
      }
      return dict[key] ?? key
    },
    uiLanguage: 'en' as const,
    targetLanguage: 'es-AR' as const,
  }),
}))

// ── Audio + URL stubs (getAudioDuration uses new Audio() + createObjectURL) ─
class MockAudio {
  onloadedmetadata: null | (() => void) = null
  onerror: null | (() => void) = null
  set src(_: string) {
    Promise.resolve().then(() => this.onerror?.())
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  searchParamsStore.clear()
  vi.stubGlobal('Audio', MockAudio)
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  })
  // Default fetch — never called in pure render tests; share-target tests
  // override this when they care.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))))
  // Default — no IndexedDB share file pending.
  vi.stubGlobal('indexedDB', undefined)
})

describe('PractiseClient — two doors (no Share)', () => {
  it('renders Free flow and Real Life Scenario doors, not the Share door', () => {
    render(<PractiseClient />)
    expect(screen.getByTestId('home-mode-chat')).toBeInTheDocument()
    expect(screen.getByTestId('home-mode-call')).toBeInTheDocument()
    expect(screen.queryByTestId('home-mode-share')).not.toBeInTheDocument()
  })

  it('renders Free flow before Real Life Scenario (primary position)', () => {
    render(<PractiseClient />)
    const chatDoor = screen.getByTestId('home-mode-chat')
    const callDoor = screen.getByTestId('home-mode-call')
    expect(chatDoor.compareDocumentPosition(callDoor)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('both doors are in-place <button>s (no href)', () => {
    render(<PractiseClient />)
    const chatDoor = screen.getByTestId('home-mode-chat')
    const callDoor = screen.getByTestId('home-mode-call')
    expect(chatDoor.tagName).toBe('BUTTON')
    expect(chatDoor).not.toHaveAttribute('href')
    expect(callDoor.tagName).toBe('BUTTON')
    expect(callDoor).not.toHaveAttribute('href')
  })
})

describe('PractiseClient — starter chips', () => {
  it('renders starter chip buttons on the Free flow card', () => {
    render(<PractiseClient />)
    expect(screen.getByTestId('home-starter-0')).toBeInTheDocument()
    expect(screen.getByTestId('home-starter-1')).toBeInTheDocument()
    expect(screen.getByTestId('home-starter-2')).toBeInTheDocument()
  })

  it('starter chips show the translated topic text', () => {
    render(<PractiseClient />)
    expect(screen.getByTestId('home-starter-0')).toHaveTextContent('Your weekend plans')
    expect(screen.getByTestId('home-starter-1')).toHaveTextContent('A recent meal')
  })

  it('clicking a starter chip sets chat mode active with that topic', async () => {
    const { fireEvent } = await import('@testing-library/react')
    render(<PractiseClient />)
    fireEvent.click(screen.getByTestId('home-starter-0'))
    await waitFor(() => {
      expect(screen.getByTestId('practice-client')).toBeInTheDocument()
      expect(screen.getByTestId('practice-client')).toHaveAttribute(
        'data-starter', 'Your weekend plans',
      )
    })
  })
})

describe('PractiseClient — methodology eyebrow', () => {
  it('renders all three pillar words (Speak · Review · Refine)', () => {
    render(<PractiseClient />)
    expect(screen.getByText('Speak')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Refine')).toBeInTheDocument()
  })

  it('marks Speak as the active pillar (aria-current="page")', () => {
    render(<PractiseClient />)
    const speakEl = screen.getByText('Speak')
    expect(speakEl).toHaveAttribute('aria-current', 'page')
  })

  it('Review pillar links to /review', () => {
    render(<PractiseClient />)
    const reviewLink = screen.getByText('Review').closest('a')
    expect(reviewLink).toHaveAttribute('href', '/review')
  })

  it('Refine pillar is a plain link to /refine (no count badge anywhere)', () => {
    render(<PractiseClient />)
    const refineLink = screen.getByText('Refine').closest('a')
    expect(refineLink).toHaveAttribute('href', '/refine')
    // The retired study-count chip should never render again.
    expect(screen.queryByTestId('home-study-chip')).not.toBeInTheDocument()
  })
})

// First-time-user critique pass (2026-05): empty accounts shouldn't see
// Review/Study as live links in the eyebrow — tapping them lands in a
// placeholder empty state that teaches "stuff I don't have" rather than
// the methodology. The home RSC computes `lockedPillars` from
// loadEmptyAccountFlags and passes it down; PractiseClient just hands it
// through. These tests cover the rendering contract.
describe('PractiseClient — locked pillars (empty account)', () => {
  it('renders Review/Refine as non-link spans when both are locked', () => {
    render(<PractiseClient lockedPillars={['review', 'refine']} />)
    // The labels are still in the DOM (we want users to read where they
    // ARE going to get to), just not wrapped in a navigable `<a>`.
    expect(screen.getByText('Review').closest('a')).toBeNull()
    expect(screen.getByText('Refine').closest('a')).toBeNull()
  })

  it('keeps Speak active even with both other pillars locked', () => {
    render(<PractiseClient lockedPillars={['review', 'refine']} />)
    expect(screen.getByText('Speak')).toHaveAttribute('aria-current', 'page')
  })

  it('locked pillar wrapper carries an aria-label with the unlock copy', () => {
    // Avoid getByLabelText — vitest.setup.ts patches makeNormalizer in a
    // way that breaks its query path (same gotcha LoginPage.test.tsx
    // documents). Query by attribute selector instead.
    const { container } = render(<PractiseClient lockedPillars={['review']} />)
    const reviewWrapper = container.querySelector('[data-locked="true"]')
    expect(reviewWrapper).not.toBeNull()
    expect(reviewWrapper?.getAttribute('aria-label')).toMatch(
      /Review — home\.pillarLockedReview/,
    )
  })

  it('only locks the pillars listed — Refine stays a live link when not in the set', () => {
    render(<PractiseClient lockedPillars={['review']} />)
    expect(screen.getByText('Review').closest('a')).toBeNull()
    expect(screen.getByText('Refine').closest('a')).toHaveAttribute('href', '/refine')
  })
})

describe('PractiseClient — share-target redirect', () => {
  // Mirrors the same IndexedDB callback choreography that readPendingShare()
  // walks: open.onsuccess → tx.store.get.onsuccess → tx.oncomplete.
  function mockIndexedDB(file: File | null) {
    const fakeGetReq = {
      result: file ?? undefined,
      onsuccess: null as null | (() => void),
      onerror: null as null | (() => void),
    }
    const fakeTx = {
      objectStore: vi.fn(() => ({
        get: vi.fn(() => {
          Promise.resolve().then(() => {
            fakeGetReq.onsuccess?.()
            Promise.resolve().then(() => fakeTx.oncomplete?.())
          })
          return fakeGetReq
        }),
        delete: vi.fn(),
      })),
      onerror: null as null | (() => void),
      onabort: null as null | (() => void),
      oncomplete: null as null | (() => void),
    }
    const fakeDB = { transaction: vi.fn(() => fakeTx) }
    const fakeOpenReq = {
      result: fakeDB,
      onsuccess: null as null | (() => void),
      onerror: null as null | (() => void),
      onupgradeneeded: null as null | (() => void),
    }
    vi.stubGlobal('indexedDB', {
      open: vi.fn(() => {
        Promise.resolve().then(() => fakeOpenReq.onsuccess?.())
        return fakeOpenReq
      }),
    })
  }

  it('navigates to /sessions/[id]/status before R2 upload completes', async () => {
    const pendingFile = new File(['audio'], 'conversation.m4a', { type: 'audio/mp4' })
    mockIndexedDB(pendingFile)
    // R2 PUT hangs so we can verify router.push fires before it resolves.
    const neverResolve = new Promise<Response>(() => { /* never */ })
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url === '/api/sessions' && opts?.method === 'POST') {
        return Promise.resolve(new Response(
          JSON.stringify({ session_id: 'sess-123', upload_url: 'https://r2.example.com/upload' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ))
      }
      if (typeof url === 'string' && url.includes('r2.example.com')) {
        return neverResolve
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    }))

    render(<PractiseClient />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/sessions/sess-123/status')
    }, { timeout: 1000 })
  })

  it('does nothing when there is no pending share file', async () => {
    mockIndexedDB(null)
    render(<PractiseClient />)
    await new Promise(r => setTimeout(r, 150))
    expect(mockPush).not.toHaveBeenCalled()
  })
})
