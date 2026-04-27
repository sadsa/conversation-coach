// __tests__/pages/IdentifyPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

import IdentifyPage from '@/app/sessions/[id]/identify/page'

const mockDetail = {
  session: { id: 's1' },
  audio_url: null,
  segments: [
    { id: 'seg-1', session_id: 's1', speaker: 'A', text: 'Hola.', start_ms: 0, end_ms: 1000, position: 0 },
    { id: 'seg-2', session_id: 's1', speaker: 'B', text: 'Buenos días.', start_ms: 1100, end_ms: 2000, position: 1 },
    { id: 'seg-3', session_id: 's1', speaker: 'A', text: '¿Cómo andás?', start_ms: 2100, end_ms: 3000, position: 2 },
  ],
  annotations: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve(mockDetail),
    status: 200,
    ok: true,
  })
})

describe('IdentifyPage', () => {
  it('renders speaker cards after loading', async () => {
    render(<IdentifyPage params={{ id: 's1' }} />)
    await waitFor(() => {
      expect(screen.getByText(/speaker a/i)).toBeInTheDocument()
      expect(screen.getByText(/speaker b/i)).toBeInTheDocument()
    })
  })

  it('confirm button is disabled when no speakers selected', async () => {
    render(<IdentifyPage params={{ id: 's1' }} />)
    await waitFor(() => screen.getByText(/confirm/i))
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
  })

  it('confirm button is enabled after selecting one speaker', async () => {
    render(<IdentifyPage params={{ id: 's1' }} />)
    await waitFor(() => screen.getByText(/speaker a/i))
    await userEvent.click(screen.getAllByRole('button')[0]) // click Speaker A card
    expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled()
  })

  it('posts speaker_labels array on confirm', async () => {
    // Second fetch call is the POST
    mockFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockDetail), status: 200, ok: true })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ status: 'analysing' }), status: 200, ok: true })

    render(<IdentifyPage params={{ id: 's1' }} />)
    await waitFor(() => screen.getByText(/speaker a/i))

    // Select Speaker A, then click Confirm
    await userEvent.click(screen.getAllByRole('button')[0])
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('/speaker') && opts?.method === 'POST'
      )
      expect(postCall).toBeTruthy()
      const body = JSON.parse(postCall![1].body)
      expect(body.speaker_labels).toEqual(['A'])
    })
  })
})
