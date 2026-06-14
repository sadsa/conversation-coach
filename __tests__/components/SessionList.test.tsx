// __tests__/components/SessionList.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

const readSession: SessionListItem = {
  id: 'sess-1', title: 'Chat with María', status: 'ready',
  duration_seconds: 512, created_at: '2026-03-15T10:00:00Z',
  processing_completed_at: '2026-03-15T10:01:23Z',
  last_viewed_at: '2026-03-15T10:05:00Z',
  reviewed_at: '2026-03-15T10:10:00Z',
}
const unreadReadySession: SessionListItem = {
  id: 'sess-3', title: 'Café with Dani', status: 'ready',
  duration_seconds: 240, created_at: '2026-03-16T10:00:00Z',
  processing_completed_at: '2026-03-16T10:01:00Z',
  last_viewed_at: null,
  reviewed_at: null,
}
const transcribingSession: SessionListItem = {
  id: 'sess-2', title: 'Untitled', status: 'transcribing',
  duration_seconds: null, created_at: '2026-03-14T10:00:00Z',
  processing_completed_at: null,
  last_viewed_at: null,
  reviewed_at: null,
}
// Backwards-compat alias for existing test cases that referenced this name
// when read state didn't exist. The earlier tests don't depend on read state.
const readySession = readSession

// Helper: open the ⋮ row menu for a given session id.
async function openSessionMenu(sessionId: string) {
  await userEvent.click(screen.getByTestId(`session-menu-${sessionId}`))
}

describe('SessionList', () => {
  it('shows empty state when no sessions', () => {
    render(<SessionList sessions={[]} />)
    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument()
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

  it('shows status label for non-terminal sessions', () => {
    render(<SessionList sessions={[transcribingSession]} />)
    expect(screen.getByText(/transcribing/i)).toBeInTheDocument()
  })

  it('hides the "Ready" status label on terminal-success rows (no information value)', () => {
    render(<SessionList sessions={[readySession]} />)
    expect(screen.queryByText(/^ready$/i)).not.toBeInTheDocument()
  })

  it('does not render any text inputs (no inline rename)', () => {
    render(<SessionList sessions={[readySession]} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('does not render a processing-time chunk', () => {
    render(<SessionList sessions={[readySession]} />)
    expect(screen.queryByText(/⚡/)).not.toBeInTheDocument()
  })
})


describe('SessionList — row context menu toggles reviewed/unreviewed', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  it('PATCHes { reviewed: true } when toggling an unreviewed row', async () => {
    const onToggle = vi.fn()
    render(
      <SessionList
        sessions={[unreadReadySession]}
        onToggleReviewed={onToggle}
      />,
    )
    await openSessionMenu('sess-3')
    await userEvent.click(screen.getByTestId('toggle-reviewed-sess-3'))
    expect(onToggle).toHaveBeenCalledWith('sess-3', true)
    await vi.waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/sessions/sess-3', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ reviewed: true }),
      })),
    )
  })

  it('PATCHes { reviewed: false } when toggling an already-reviewed row', async () => {
    const onToggle = vi.fn()
    render(
      <SessionList sessions={[readSession]} onToggleReviewed={onToggle} />,
    )
    await openSessionMenu('sess-1')
    await userEvent.click(screen.getByTestId('toggle-reviewed-sess-1'))
    expect(onToggle).toHaveBeenCalledWith('sess-1', false)
    await vi.waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/sessions/sess-1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ reviewed: false }),
      })),
    )
  })

  it('rolls back the optimistic flip and shows an error toast when the API fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    const onToggle = vi.fn()
    render(
      <SessionList sessions={[readSession]} onToggleReviewed={onToggle} />,
    )
    await openSessionMenu('sess-1')
    await userEvent.click(screen.getByTestId('toggle-reviewed-sess-1'))
    await vi.waitFor(() => expect(onToggle).toHaveBeenCalledTimes(2))
    expect(onToggle).toHaveBeenNthCalledWith(1, 'sess-1', false)
    expect(onToggle).toHaveBeenNthCalledWith(2, 'sess-1', true)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('does NOT render a toggle option for non-ready (still processing) rows', async () => {
    render(<SessionList sessions={[transcribingSession]} />)
    await openSessionMenu('sess-2')
    expect(screen.queryByTestId('toggle-reviewed-sess-2')).not.toBeInTheDocument()
  })
})

describe('SessionList — delete via row menu (optimistic + Undo)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides the row immediately and shows an Undo toast', async () => {
    render(<SessionList sessions={[readySession]} />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openSessionMenu('sess-1')
    await user.click(screen.getByTestId('delete-session-sess-1'))
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
    expect(screen.queryByTestId('modal-backdrop')).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('cancels the pending DELETE and restores the row on Undo', async () => {
    const onDeleted = vi.fn()
    render(<SessionList sessions={[readySession]} onDeleted={onDeleted} />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openSessionMenu('sess-1')
    await user.click(screen.getByTestId('delete-session-sess-1'))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /undo/i }))
    await vi.advanceTimersByTimeAsync(6000)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByTestId('session-menu-sess-1')).toBeInTheDocument()
  })

  it('calls DELETE and fires onDeleted once the Undo window expires', async () => {
    const onDeleted = vi.fn()
    render(<SessionList sessions={[readySession]} onDeleted={onDeleted} />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openSessionMenu('sess-1')
    await user.click(screen.getByTestId('delete-session-sess-1'))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument())
    await vi.advanceTimersByTimeAsync(5100)
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions/sess-1', { method: 'DELETE' })
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith('sess-1'))
  })

  it('restores the row + shows error toast when the DELETE fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    const onDeleted = vi.fn()
    render(<SessionList sessions={[readySession]} onDeleted={onDeleted} />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openSessionMenu('sess-1')
    await user.click(screen.getByTestId('delete-session-sess-1'))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument())
    await vi.advanceTimersByTimeAsync(5100)
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(onDeleted).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(screen.getByTestId('session-menu-sess-1')).toBeInTheDocument())
  })
})
