// __tests__/components/HomeClient.shareTarget.test.tsx
//
// Verifies that when the share-target flow delivers a pending file from
// IndexedDB, HomeClient creates a session and immediately navigates to
// /sessions/[id]/status — BEFORE the R2 upload completes.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { HomeClient } from '@/components/HomeClient'

// ── Router mock ───────────────────────────────────────────────────────────────
const mockPush = vi.fn()
const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  // No welcome param in this suite — share-target tests deliberately exercise
  // the IndexedDB pickup path, not the onboarding peak-end beat.
  useSearchParams: () => ({ get: () => null }),
}))

// ── Component mocks (avoid rendering the full dashboard tree) ─────────────────
vi.mock('@/components/DashboardReminders', () => ({ DashboardReminders: () => null }))
vi.mock('@/components/DashboardInProgress', () => ({ DashboardInProgress: () => null }))
vi.mock('@/components/DashboardRecentSessions', () => ({ DashboardRecentSessions: () => null }))
vi.mock('@/components/Icon', () => ({ Icon: () => null }))
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    uiLanguage: 'en' as const,
    // HomeClient drives its greeting + Practice CTA subtitle from
    // targetLanguage; the greeting helper crashes on undefined, so
    // the mock must supply a concrete language even though these
    // tests only assert the share-target redirect.
    targetLanguage: 'es-AR' as const,
  }),
}))

// ── Audio + URL stubs (getAudioDuration uses new Audio() + createObjectURL) ───
class MockAudio {
  onloadedmetadata: null | (() => void) = null
  onerror: null | (() => void) = null
  set src(_: string) {
    // Fire onerror immediately so getAudioDuration resolves with 0
    Promise.resolve().then(() => this.onerror?.())
  }
}
vi.stubGlobal('Audio', MockAudio)
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock'),
  revokeObjectURL: vi.fn(),
})

// ── IndexedDB simulation ───────────────────────────────────────────────────────
// Follows the exact callback chain that readPendingShare() sets up:
// open.onsuccess → tx.store.get.onsuccess → tx.oncomplete
function mockIndexedDB(file: File | null) {
  const fakeGetReq = {
    result: file ?? undefined,
    onsuccess: null as null | (() => void),
    onerror: null as null | (() => void),
  }

  const fakeTx = {
    objectStore: vi.fn(() => ({
      get: vi.fn(() => {
        // Fire onsuccess after the code has had a chance to set it
        Promise.resolve().then(() => {
          fakeGetReq.onsuccess?.()
          // tx.oncomplete is set inside get.onsuccess — fire it next tick
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

  const fakeDB = {
    transaction: vi.fn(() => fakeTx),
  }

  const fakeOpenReq = {
    result: fakeDB,
    onsuccess: null as null | (() => void),
    onerror: null as null | (() => void),
    onupgradeneeded: null as null | (() => void),
  }

  vi.stubGlobal('indexedDB', {
    open: vi.fn(() => {
      // Fire open.onsuccess after code sets it
      Promise.resolve().then(() => fakeOpenReq.onsuccess?.())
      return fakeOpenReq
    }),
  })
}

// ── Fetch mock ────────────────────────────────────────────────────────────────
// POST /api/sessions resolves quickly; R2 PUT hangs indefinitely so we can
// assert the router.push fires before it ever settles.
const neverResolve = new Promise<Response>(() => { /* intentionally never resolves */ })

beforeEach(() => {
  vi.clearAllMocks()
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
})

describe('HomeClient — share-target redirect', () => {
  it('navigates to /sessions/[id]/status before R2 upload completes', async () => {
    const pendingFile = new File(['audio'], 'conversation.m4a', { type: 'audio/mp4' })
    mockIndexedDB(pendingFile)

    render(<HomeClient initialSessions={[]} initialSummary={null} />)

    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/sessions/sess-123/status')
    }, { timeout: 1000 })
  })

  it('does nothing when there is no pending share file', async () => {
    mockIndexedDB(null)

    render(<HomeClient initialSessions={[]} initialSummary={null} />)

    await new Promise(r => setTimeout(r, 150))
    expect(mockPush).not.toHaveBeenCalled()
  })
})
