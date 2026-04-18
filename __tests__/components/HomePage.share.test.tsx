// __tests__/components/HomePage.share.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock Audio so getAudioDuration resolves immediately
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

// Mock fetch for sessions list and session creation
global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
  if (url === '/api/sessions' && (!options?.method || options.method === 'GET')) {
    return Promise.resolve({ json: () => Promise.resolve([]) })
  }
  if (url === '/api/sessions' && options?.method === 'POST') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ session_id: 's1', upload_url: 'http://r2/put' }) })
  }
  // R2 PUT, upload-complete, etc.
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

describe('HomePage — share pickup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules() // force fresh module import per test — avoids useEffect running with stale IDB mock
  })

  it('shows the pending upload card when a share is pending', async () => {
    const sharedFile = new File(['audio'], 'PTT-20260327.opus', { type: 'audio/ogg' })
    setupIDB(sharedFile)

    const { default: HomePage } = await import('@/app/page')
    const { getAllByText } = render(<HomePage />)

    // The shared `.opus` file is auto-uploaded, so the new session shows up
    // in BOTH the in-progress callout at the top of the dashboard AND the
    // recent conversations list — that duplication is intentional, so we
    // assert >= 1 match rather than a unique one.
    await waitFor(() => {
      expect(getAllByText('PTT-20260327.opus').length).toBeGreaterThan(0)
    }, { timeout: 2000 })
  })

  it('does nothing if no share is pending', async () => {
    setupIDB(null)
    const { default: HomePage } = await import('@/app/page')
    const { queryAllByText } = render(<HomePage />)
    await new Promise(r => setTimeout(r, 100))
    expect(queryAllByText('PTT-20260327.opus')).toHaveLength(0)
  })
})
