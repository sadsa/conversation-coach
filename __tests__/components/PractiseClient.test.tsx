// __tests__/components/PractiseClient.test.tsx
//
// The Practise-as-home redesign moved the methodology entry point to `/`.
// This suite covers the new home:
//
//   • Renders two live-practice doors: Free flow (primary) + Real Life
//     Scenario (secondary). The Share/upload door was moved to the Review
//     step (ADR 0002) — it no longer appears here.
//   • Generated conversation-topic buttons render inside the Talk freely
//     section (above its no-topic row); each seeds a chat session with its
//     topic.
//   • Clicking a topic button starts a chat session with that topic.
//   • Both doors are in-place `<button>`s (they mount <PracticeClient> on
//     tap — the standalone /practice route was retired so discard returns
//     to these doors).
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
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string, replacements?: Record<string, string | number>) => {
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
        'practice.chatStarterAction': 'Talk about {topic}',
        'home.welcomeBeat': 'All set. Ready when you are.',
      }
      const template = dict[key] ?? key
      if (!replacements) return template
      return template.replace(/\{(\w+)\}/g, (_, k) => String(replacements[k] ?? ''))
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

describe('PractiseClient — topic buttons', () => {
  // The default fetch mock resolves to `{}`, which the component treats as a
  // malformed payload and falls back to the static chatStarter strings. The
  // fallback applies in a microtask after the fetch settles, so these assert
  // via findBy* / waitFor rather than synchronous getBy*.
  it('renders generated topic buttons (fallback) once starters resolve', async () => {
    render(<PractiseClient />)
    expect(await screen.findByTestId('home-starter-0')).toBeInTheDocument()
    expect(screen.getByTestId('home-starter-1')).toBeInTheDocument()
    expect(screen.getByTestId('home-starter-2')).toBeInTheDocument()
  })

  it('topic buttons frame the topic as an action', async () => {
    render(<PractiseClient />)
    expect(await screen.findByTestId('home-starter-0')).toHaveTextContent('Talk about your weekend plans')
    expect(screen.getByTestId('home-starter-1')).toHaveTextContent('Talk about a recent meal')
  })

  it('clicking a topic button sets chat mode active with that topic', async () => {
    const { fireEvent } = await import('@testing-library/react')
    render(<PractiseClient />)
    fireEvent.click(await screen.findByTestId('home-starter-0'))
    await waitFor(() => {
      expect(screen.getByTestId('practice-client')).toBeInTheDocument()
      expect(screen.getByTestId('practice-client')).toHaveAttribute(
        'data-starter', 'Your weekend plans',
      )
    })
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
