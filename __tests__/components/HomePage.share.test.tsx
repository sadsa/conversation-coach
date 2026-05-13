// __tests__/components/HomePage.share.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// ── Router mock — capture push calls ─────────────────────────────────────────
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock Audio so getAudioDuration resolves immediately with duration=30
global.URL.createObjectURL = vi.fn(() => 'blob:mock')
global.URL.revokeObjectURL = vi.fn()
class MockAudio {
  duration = 30
  onloadedmetadata: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  get src() { return this._src }
  set src(_val: string) {
    this._src = _val
    setTimeout(() => { this.onloadedmetadata?.() }, 0)
  }
}
Object.defineProperty(global, 'Audio', { value: MockAudio, writable: true })

// Mock fetch for session creation and downstream calls
global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
  if (url === '/api/sessions' && options?.method === 'POST') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ session_id: 's1', upload_url: 'http://r2/put' }) })
  }
  // R2 PUT hangs — we want to verify router.push fires before it resolves
  if (typeof url === 'string' && url.includes('r2')) {
    return new Promise(() => { /* intentionally never resolves */ })
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
})

// Minimal IndexedDB mock
function setupIDB(file: File | null) {
  const store: Record<string, unknown> = file ? { file } : {}
  const mockIDB = {
    open: vi.fn().mockImplementation(() => {
      const req: Record<string, unknown> = {}
      setTimeout(() => {
        const db = {
          transaction: vi.fn().mockImplementation(() => {
            const tx: Record<string, unknown> = {}
            const objectStore = {
              get: vi.fn().mockImplementation(() => {
                const getReq: Record<string, unknown> = {}
                setTimeout(() => {
                  ;(getReq as { result: unknown }).result = store['file'] ?? undefined
                  ;(getReq as { onsuccess?: () => void }).onsuccess?.()
                }, 0)
                return getReq
              }),
              delete: vi.fn().mockImplementation(() => {
                delete store['file']
              }),
            }
            tx.objectStore = vi.fn().mockReturnValue(objectStore)
            setTimeout(() => {
              ;(tx as { oncomplete?: () => void }).oncomplete?.()
            }, 10)
            return tx
          }),
        }
        ;(req as { result: unknown }).result = db
        ;(req as { onsuccess?: () => void }).onsuccess?.()
      }, 0)
      return req
    }),
  }
  Object.defineProperty(global, 'indexedDB', { value: mockIDB, writable: true })
}

// The share-pickup behaviour lives in <HomeClient>. The new flow navigates
// straight to the status page instead of adding the session to the dashboard.
describe('HomeClient — share pickup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('navigates to the status page when a share is pending', async () => {
    const sharedFile = new File(['audio'], 'PTT-20260327.opus', { type: 'audio/ogg' })
    setupIDB(sharedFile)

    const { HomeClient } = await import('@/components/HomeClient')
    render(<HomeClient initialSessions={[]} initialSummary={null} />)

    // Session is created and router.push fires immediately — before the R2 PUT
    // (which never resolves in this test) has a chance to complete.
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/sessions/s1/status')
    }, { timeout: 2000 })
  })

  it('does nothing if no share is pending', async () => {
    setupIDB(null)
    const { HomeClient } = await import('@/components/HomeClient')
    render(<HomeClient initialSessions={[]} initialSummary={null} />)
    await new Promise(r => setTimeout(r, 100))
    expect(mockPush).not.toHaveBeenCalled()
  })
})
