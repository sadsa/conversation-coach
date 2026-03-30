// __tests__/components/SessionList.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionList } from '@/components/SessionList'
import type { SessionListItem } from '@/lib/types'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    onClick,
  }: {
    href: string
    children: React.ReactNode
    className?: string
    onClick?: React.MouseEventHandler
  }) => (
    <a href={href} className={className} onClick={onClick}>{children}</a>
  ),
}))

const readySession: SessionListItem = {
  id: 'sess-1', title: 'Chat with María', status: 'ready',
  duration_seconds: 512, created_at: '2026-03-15T10:00:00Z',
  processing_completed_at: '2026-03-15T10:01:23Z',
}
const transcribingSession: SessionListItem = {
  id: 'sess-2', title: 'Untitled', status: 'transcribing',
  duration_seconds: null, created_at: '2026-03-14T10:00:00Z',
  processing_completed_at: null,
}

describe('SessionList', () => {
  it('shows empty state when no sessions', () => {
    render(<SessionList sessions={[]} />)
    expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument()
  })

  it('renders session title', () => {
    render(<SessionList sessions={[readySession]} />)
    expect(screen.getByText('Chat with María')).toBeInTheDocument()
  })

  it('ready session links to /sessions/:id', () => {
    render(<SessionList sessions={[readySession]} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sessions/sess-1')
  })

  it('non-ready session links to /sessions/:id/status', () => {
    render(<SessionList sessions={[transcribingSession]} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sessions/sess-2/status')
  })

  it('shows formatted duration as Xm Ys', () => {
    render(<SessionList sessions={[readySession]} />)
    // 512 seconds = 8m 32s
    expect(screen.getByText(/8m 32s/)).toBeInTheDocument()
  })

  it('omits duration when duration_seconds is null', () => {
    render(<SessionList sessions={[transcribingSession]} />)
    expect(screen.queryByText(/\dm \d+s/)).not.toBeInTheDocument()
  })

  it('shows status label', () => {
    render(<SessionList sessions={[transcribingSession]} />)
    expect(screen.getByText(/transcribing/i)).toBeInTheDocument()
  })

  it('does not render any text inputs (no inline rename)', () => {
    render(<SessionList sessions={[readySession]} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows processing time for ready session with processing_completed_at', () => {
    render(<SessionList sessions={[readySession]} />)
    // created_at: 10:00:00Z, processing_completed_at: 10:01:23Z = 83 seconds = 1m 23s
    expect(screen.getByText(/⚡ 1m 23s/)).toBeInTheDocument()
  })

  it('omits processing time when processing_completed_at is null', () => {
    render(<SessionList sessions={[{ ...readySession, processing_completed_at: null }]} />)
    expect(screen.queryByText(/⚡/)).not.toBeInTheDocument()
  })
})

describe('SessionList — swipe to delete', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  it('shows confirmation modal when delete seam is triggered', async () => {
    render(<SessionList sessions={[readySession]} />)
    await userEvent.click(screen.getByTestId('delete-session-sess-1'))
    expect(screen.getByTestId('modal-backdrop')).toBeInTheDocument()
  })

  it('modal shows session title and data warning', async () => {
    render(<SessionList sessions={[readySession]} />)
    await userEvent.click(screen.getByTestId('delete-session-sess-1'))
    expect(screen.getByText(/Chat with María/)).toBeInTheDocument()
    expect(screen.getByText(/annotations/i)).toBeInTheDocument()
    expect(screen.getByText(/practice items/i)).toBeInTheDocument()
  })

  it('closes modal without calling API on Cancel', async () => {
    render(<SessionList sessions={[readySession]} />)
    await userEvent.click(screen.getByTestId('delete-session-sess-1'))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByTestId('modal-backdrop')).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('calls DELETE API and fires onDeleted when Delete is confirmed', async () => {
    const onDeleted = vi.fn()
    render(<SessionList sessions={[readySession]} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByTestId('delete-session-sess-1'))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions/sess-1', { method: 'DELETE' })
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith('sess-1'))
  })

  it('shows error toast and does not call onDeleted when API fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    const onDeleted = vi.fn()
    render(<SessionList sessions={[readySession]} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByTestId('delete-session-sess-1'))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
