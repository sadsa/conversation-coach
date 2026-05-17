// __tests__/components/PractiseClient.test.tsx
//
// The Practise-as-home redesign moved the methodology entry point to `/`.
// This suite covers the new home:
//
//   • Renders the three doors (Pick up a call / Casual chat / Share a
//     voice note) and points them at the right routes.
//   • Renders the Practise · Review · Study eyebrow with Practise as the
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
        'practice.modeCallTitle': 'Pick up a call',
        'practice.modeCallBlurb': 'Someone new calls.',
        'practice.modeChatTitle': 'Casual chat',
        'practice.modeChatBlurb': 'The coach starts the back-and-forth.',
        'home.modeShareTitle': 'Share a voice note',
        'home.modeShareBlurb': 'Recorded a real conversation?',
        'home.pillarPractise': 'Practise',
        'home.pillarReview': 'Review',
        'home.pillarStudy': 'Study',
        'home.pillarAria': 'Methodology',
        'home.subhead': 'How do you want to practise?',
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

describe('PractiseClient — three doors', () => {
  it('renders all three mode cards with the right copy', () => {
    render(<PractiseClient />)
    expect(screen.getByTestId('home-mode-call')).toBeInTheDocument()
    expect(screen.getByTestId('home-mode-chat')).toBeInTheDocument()
    expect(screen.getByTestId('home-mode-share')).toBeInTheDocument()
  })

  it('points Call door at /practice?mode=call (auto-starts call mode)', () => {
    render(<PractiseClient />)
    expect(screen.getByTestId('home-mode-call')).toHaveAttribute('href', '/practice?mode=call')
  })

  it('points Chat door at /practice?mode=chat (auto-starts chat mode)', () => {
    render(<PractiseClient />)
    expect(screen.getByTestId('home-mode-chat')).toHaveAttribute('href', '/practice?mode=chat')
  })

  it('points Share door at /onboarding?step=2 (WhatsApp share illustration)', () => {
    render(<PractiseClient />)
    expect(screen.getByTestId('home-mode-share')).toHaveAttribute('href', '/onboarding?step=2')
  })
})

describe('PractiseClient — methodology eyebrow', () => {
  it('renders all three pillar words (Practise · Review · Study)', () => {
    render(<PractiseClient />)
    expect(screen.getByText('Practise')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Study')).toBeInTheDocument()
  })

  it('marks Practise as the active pillar (aria-current="page")', () => {
    render(<PractiseClient />)
    const practiseEl = screen.getByText('Practise')
    expect(practiseEl).toHaveAttribute('aria-current', 'page')
  })

  it('Review pillar links to /review', () => {
    render(<PractiseClient />)
    const reviewLink = screen.getByText('Review').closest('a')
    expect(reviewLink).toHaveAttribute('href', '/review')
  })

  it('Study pillar is a plain link to /write (no count badge anywhere)', () => {
    render(<PractiseClient />)
    const studyLink = screen.getByText('Study').closest('a')
    expect(studyLink).toHaveAttribute('href', '/write')
    // The retired study-count chip should never render again.
    expect(screen.queryByTestId('home-study-chip')).not.toBeInTheDocument()
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
