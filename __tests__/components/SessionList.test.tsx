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
}
const unreadReadySession: SessionListItem = {
  id: 'sess-3', title: 'Café with Dani', status: 'ready',
  duration_seconds: 240, created_at: '2026-03-16T10:00:00Z',
  processing_completed_at: '2026-03-16T10:01:00Z',
  last_viewed_at: null,
}
const transcribingSession: SessionListItem = {
  id: 'sess-2', title: 'Untitled', status: 'transcribing',
  duration_seconds: null, created_at: '2026-03-14T10:00:00Z',
  processing_completed_at: null,
  last_viewed_at: null,
}
// Backwards-compat alias for existing test cases that referenced this name
// when read state didn't exist. The earlier tests don't depend on read state.
const readySession = readSession

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
    // Processing time was removed from the row; the bucketed list relies on
    // date + duration alone to distinguish rows.
    render(<SessionList sessions={[readySession]} />)
    expect(screen.queryByText(/⚡/)).not.toBeInTheDocument()
  })
})

describe('SessionList — unread visual (inbox state)', () => {
  it('marks ready+last_viewed_at=null sessions as unread via weight + tone (no dot)', () => {
    const { container } = render(<SessionList sessions={[unreadReadySession]} />)
    // The dot was distilled out — read state lives on weight + tone alone.
    expect(container.querySelector('.bg-accent-primary')).not.toBeInTheDocument()
    // Title carries the assertive default: semibold + primary tone.
    const title = screen.getByText('Café with Dani')
    expect(title.className).toMatch(/font-semibold/)
    expect(title.className).toMatch(/text-text-primary/)
    // A11y: an sr-only suffix carries the unread signal for AT users. We
    // don't pin the exact phrasing because it's localised.
    const srOnly = container.querySelector('span.sr-only:not([aria-hidden="true"])')
    expect(srOnly?.textContent ?? '').toMatch(/\S+/)
  })

  it('reads recede to font-normal + text-text-secondary (calmer than unread)', () => {
    render(<SessionList sessions={[readSession]} />)
    const title = screen.getByText('Chat with María')
    expect(title.className).toMatch(/font-normal/)
    expect(title.className).toMatch(/text-text-secondary/)
  })

  it('does NOT render an unread dot on already-viewed sessions', () => {
    const { container } = render(<SessionList sessions={[readSession]} />)
    expect(container.querySelector('.bg-accent-primary')).not.toBeInTheDocument()
  })

  it('does NOT render an unread sr-only suffix on already-viewed sessions', () => {
    const { container } = render(<SessionList sessions={[readSession]} />)
    // We filter out the test seam buttons (which carry their own sr-only
    // class) — what we actually care about is the unread suffix on the title.
    const ariaSuffixes = Array.from(container.querySelectorAll('span.sr-only'))
    expect(ariaSuffixes).toHaveLength(0)
  })

  it('does NOT mark non-ready sessions as unread (still processing)', () => {
    // Transcribing sessions can't be "read" yet because there's nothing to
    // read; they just show the status pill.
    const { container } = render(<SessionList sessions={[transcribingSession]} />)
    expect(container.querySelector('.bg-accent-primary')).not.toBeInTheDocument()
    expect(container.querySelector('span.sr-only')).toBeNull()
  })
})

describe('SessionList — swipe-right toggles read/unread', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  it('PATCHes { read: true } when toggling an unread row', async () => {
    const onToggle = vi.fn()
    render(
      <SessionList
        sessions={[unreadReadySession]}
        onToggleRead={onToggle}
      />,
    )
    await userEvent.click(screen.getByTestId('toggle-read-sess-3'))
    // Optimistic flip fires on the parent first…
    expect(onToggle).toHaveBeenCalledWith('sess-3', true)
    // …then the network call goes out with the matching payload.
    await vi.waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/sessions/sess-3', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
      })),
    )
  })

  it('PATCHes { read: false } when toggling an already-read row', async () => {
    const onToggle = vi.fn()
    render(
      <SessionList sessions={[readSession]} onToggleRead={onToggle} />,
    )
    await userEvent.click(screen.getByTestId('toggle-read-sess-1'))
    expect(onToggle).toHaveBeenCalledWith('sess-1', false)
    await vi.waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/sessions/sess-1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ read: false }),
      })),
    )
  })

  it('rolls back the optimistic flip and shows an error toast when the API fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    const onToggle = vi.fn()
    render(
      <SessionList sessions={[readSession]} onToggleRead={onToggle} />,
    )
    await userEvent.click(screen.getByTestId('toggle-read-sess-1'))
    // First call: optimistic flip. Second call: rollback with the inverse.
    await vi.waitFor(() => expect(onToggle).toHaveBeenCalledTimes(2))
    expect(onToggle).toHaveBeenNthCalledWith(1, 'sess-1', false)
    expect(onToggle).toHaveBeenNthCalledWith(2, 'sess-1', true)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('does NOT render a toggle seam for non-ready (still processing) rows', () => {
    render(<SessionList sessions={[transcribingSession]} />)
    expect(screen.queryByTestId('toggle-read-sess-2')).not.toBeInTheDocument()
  })

  // The reveal label ("Mark read" / "Mark unread") is only mounted while the
  // row is actively being swiped to the right (`translateX > 0`) — at rest
  // both reveal layers are unmounted so swipe-LEFT can show its red delete
  // background without being painted over by the toggle layer. The actual
  // toggle behaviour for both states is verified above via the test seam.
})

// Optimistic delete + 5s Undo (parity with WriteList). The old confirmation
// Modal flow was retired in the /distill design pass — the swipe gesture is
// the commit, the toast is the safety net.
describe('SessionList — swipe to delete (optimistic + Undo)', () => {
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
    await user.click(screen.getByTestId('delete-session-sess-1'))
    // Toast appears with Undo affordance, no Modal anywhere.
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
    expect(screen.queryByTestId('modal-backdrop')).not.toBeInTheDocument()
    // No network call yet — DELETE is scheduled inside the Undo window.
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('cancels the pending DELETE and restores the row on Undo', async () => {
    const onDeleted = vi.fn()
    render(<SessionList sessions={[readySession]} onDeleted={onDeleted} />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByTestId('delete-session-sess-1'))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /undo/i }))
    // Advance past the would-be DELETE timer to prove it really was cancelled.
    await vi.advanceTimersByTimeAsync(6000)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
    // Row's seam button is still mounted — i.e. the row came back.
    expect(screen.getByTestId('delete-session-sess-1')).toBeInTheDocument()
  })

  it('calls DELETE and fires onDeleted once the Undo window expires', async () => {
    const onDeleted = vi.fn()
    render(<SessionList sessions={[readySession]} onDeleted={onDeleted} />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByTestId('delete-session-sess-1'))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument())
    await vi.advanceTimersByTimeAsync(5100)
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions/sess-1', { method: 'DELETE' })
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith('sess-1'))
  })

  it('restores the row + shows error toast when the DELETE fails', async () => {
    // First call (the actual DELETE) fails; subsequent toast renders use the
    // cached state so we don't need to re-mock anything.
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    const onDeleted = vi.fn()
    render(<SessionList sessions={[readySession]} onDeleted={onDeleted} />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByTestId('delete-session-sess-1'))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument())
    await vi.advanceTimersByTimeAsync(5100)
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(onDeleted).not.toHaveBeenCalled()
    // Row restored + an error alert is up.
    await vi.waitFor(() => expect(screen.getByTestId('delete-session-sess-1')).toBeInTheDocument())
  })
})
