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

  it('calls handleFile with the stored file on mount if a share is pending', async () => {
    const sharedFile = new File(['audio'], 'voice_note.opus', { type: 'audio/ogg' })
    setupIDB(sharedFile)

    // Import after mocks are set up
    const { default: HomePage } = await import('@/app/page')

    // Verify the upload flow is triggered by checking "Uploading…" appears in the DOM
    const { getByText } = render(<HomePage />)

    await waitFor(() => {
      // "Uploading…" text appears when handleFile is called
      expect(getByText(/uploading/i)).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('does nothing if no share is pending', async () => {
    setupIDB(null)
    const { default: HomePage } = await import('@/app/page')
    const { queryByText } = render(<HomePage />)
    await new Promise(r => setTimeout(r, 100))
    expect(queryByText(/uploading/i)).toBeNull()
  })
})
