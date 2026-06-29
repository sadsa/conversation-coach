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
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const readSession: SessionListItem = {
  id: 'sess-1', title: 'Chat with María', status: 'ready',
  duration_seconds: 512, created_at: '2026-03-15T10:00:00Z',
  processing_completed_at: '2026-03-15T10:01:23Z',
  last_viewed_at: '2026-03-15T10:05:00Z',
  reviewed_at: '2026-03-15T10:10:00Z',
  review_state: null, saved_count: 0, due_count: 0,
}
const unreadReadySession: SessionListItem = {
  id: 'sess-3', title: 'Café with Dani', status: 'ready',
  duration_seconds: 240, created_at: '2026-03-16T10:00:00Z',
  processing_completed_at: '2026-03-16T10:01:00Z',
  last_viewed_at: null,
  reviewed_at: null,
  review_state: null, saved_count: 0, due_count: 0,
}
const transcribingSession: SessionListItem = {
  id: 'sess-2', title: 'Untitled', status: 'transcribing',
  duration_seconds: null, created_at: '2026-03-14T10:00:00Z',
  processing_completed_at: null,
  last_viewed_at: null,
  reviewed_at: null,
  review_state: null, saved_count: 0, due_count: 0,
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

  it('does not render a duration chunk (Xm Ys) on any row', () => {
    render(<SessionList sessions={[readySession]} />)
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


describe('SessionList — read/unread bold styling', () => {
  it('renders unread session title in bold (font-semibold)', () => {
    render(<SessionList sessions={[unreadReadySession]} />)
    const titleEl = screen.getByText('Café with Dani')
    expect(titleEl).toHaveClass('font-semibold')
    expect(titleEl).toHaveClass('text-text-primary')
  })

  it('renders read session title in normal weight', () => {
    render(<SessionList sessions={[readSession]} />)
    const titleEl = screen.getByText('Chat with María')
    expect(titleEl).toHaveClass('font-normal')
    expect(titleEl).toHaveClass('text-text-secondary')
    expect(titleEl).not.toHaveClass('font-semibold')
  })
})

describe('SessionList — row context menu toggles read/unread', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
  })

  it('PATCHes { read: true } when marking an unread row as read', async () => {
    const onToggle = vi.fn()
    render(
      <SessionList
        sessions={[unreadReadySession]}
        onToggleRead={onToggle}
      />,
    )
    await openSessionMenu('sess-3')
    await userEvent.click(screen.getByTestId('toggle-read-sess-3'))
    expect(onToggle).toHaveBeenCalledWith('sess-3', true)
    await vi.waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/sessions/sess-3', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
      })),
    )
  })

  it('PATCHes { read: false } when marking a read row as unread', async () => {
    const onToggle = vi.fn()
    render(
      <SessionList sessions={[readSession]} onToggleRead={onToggle} />,
    )
    await openSessionMenu('sess-1')
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
    await openSessionMenu('sess-1')
    await userEvent.click(screen.getByTestId('toggle-read-sess-1'))
    await vi.waitFor(() => expect(onToggle).toHaveBeenCalledTimes(2))
    expect(onToggle).toHaveBeenNthCalledWith(1, 'sess-1', false)
    expect(onToggle).toHaveBeenNthCalledWith(2, 'sess-1', true)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('does NOT render a toggle option for non-ready (still processing) rows', async () => {
    render(<SessionList sessions={[transcribingSession]} />)
    await openSessionMenu('sess-2')
    expect(screen.queryByTestId('toggle-read-sess-2')).not.toBeInTheDocument()
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

// ---------------------------------------------------------------------------
// Issue 02: session state badge, counts, and action buttons
// ---------------------------------------------------------------------------

function makeReviewSession(
  overrides: Partial<SessionListItem> & { id: string; review_state: SessionListItem['review_state'] }
): SessionListItem {
  return {
    title: 'Test session',
    status: 'ready',
    duration_seconds: 300,
    created_at: '2026-03-15T10:00:00Z',
    processing_completed_at: '2026-03-15T10:01:00Z',
    last_viewed_at: '2026-03-15T10:05:00Z',
    reviewed_at: null,
    saved_count: 0,
    due_count: 0,
    ...overrides,
  }
}

describe('SessionList — review state badge', () => {
  it('shows no badge when review_state is null', () => {
    const session = makeReviewSession({ id: 'sx', review_state: null })
    render(<SessionList sessions={[session]} />)
    expect(screen.queryByTestId('review-badge-sx')).not.toBeInTheDocument()
  })

  it('shows "In progress" badge for partial state', () => {
    const session = makeReviewSession({ id: 'sx', review_state: 'partial' })
    render(<SessionList sessions={[session]} />)
    expect(screen.getByTestId('review-badge-sx')).toHaveTextContent('In progress')
  })

  it('shows "Ready to study" badge for ready_to_study state', () => {
    const session = makeReviewSession({ id: 'sx', review_state: 'ready_to_study', saved_count: 3 })
    render(<SessionList sessions={[session]} />)
    expect(screen.getByTestId('review-badge-sx')).toHaveTextContent('Ready to study')
  })

  it('shows "Nothing kept" badge for nothing_kept state', () => {
    const session = makeReviewSession({ id: 'sx', review_state: 'nothing_kept' })
    render(<SessionList sessions={[session]} />)
    expect(screen.getByTestId('review-badge-sx')).toHaveTextContent('Nothing kept')
  })
})

describe('SessionList — counts display', () => {
  it('shows counts when saved_count > 0', () => {
    const session = makeReviewSession({ id: 'sx', review_state: 'ready_to_study', saved_count: 3, due_count: 1 })
    render(<SessionList sessions={[session]} />)
    expect(screen.getByTestId('counts-sx')).toHaveTextContent('3 saved')
    expect(screen.getByTestId('counts-sx')).toHaveTextContent('1 due')
  })

  it('hides counts when both saved_count and due_count are 0', () => {
    const session = makeReviewSession({ id: 'sx', review_state: 'partial', saved_count: 0, due_count: 0 })
    render(<SessionList sessions={[session]} />)
    expect(screen.queryByTestId('counts-sx')).not.toBeInTheDocument()
  })

  it('hides counts entirely when review_state is null', () => {
    const session = makeReviewSession({ id: 'sx', review_state: null, saved_count: 2, due_count: 1 })
    render(<SessionList sessions={[session]} />)
    expect(screen.queryByTestId('counts-sx')).not.toBeInTheDocument()
  })
})

describe('SessionList — action buttons', () => {
  it('shows no standalone Review link for partial state (the whole card already navigates to /sessions/:id)', () => {
    const session = makeReviewSession({ id: 'sx', review_state: 'partial' })
    render(<SessionList sessions={[session]} />)
    expect(screen.queryByTestId('action-review-sx')).not.toBeInTheDocument()
    // The card itself is the link to the detail view.
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sessions/sx')
  })

  it('shows a "Study" link for ready_to_study state pointing to /study?session_id', () => {
    const session = makeReviewSession({ id: 'sx', review_state: 'ready_to_study', saved_count: 2 })
    render(<SessionList sessions={[session]} />)
    const link = screen.getByTestId('action-study-sx')
    expect(link).toHaveAttribute('href', '/study?session_id=sx')
  })

  it('shows no Review or Study action button for nothing_kept state', () => {
    const session = makeReviewSession({ id: 'sx', review_state: 'nothing_kept' })
    render(<SessionList sessions={[session]} />)
    expect(screen.queryByTestId('action-review-sx')).not.toBeInTheDocument()
    expect(screen.queryByTestId('action-study-sx')).not.toBeInTheDocument()
  })
})

describe('SessionList — nothing_kept delete prompt', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the delete prompt by default for nothing_kept sessions', () => {
    const session = makeReviewSession({ id: 'sx', review_state: 'nothing_kept' })
    render(<SessionList sessions={[session]} />)
    expect(screen.getByTestId('delete-prompt-sx')).toBeInTheDocument()
  })

  it('hides the delete prompt when Cancel is clicked', async () => {
    const session = makeReviewSession({ id: 'sx', review_state: 'nothing_kept' })
    render(<SessionList sessions={[session]} />)
    await userEvent.click(screen.getByTestId('remove-cancel-sx'))
    expect(screen.queryByTestId('delete-prompt-sx')).not.toBeInTheDocument()
    // Session card remains
    expect(screen.getByTestId('review-badge-sx')).toBeInTheDocument()
  })

  it('triggers the optimistic delete flow when Remove is confirmed', async () => {
    const onDeleted = vi.fn()
    const session = makeReviewSession({ id: 'sx', review_state: 'nothing_kept' })
    render(<SessionList sessions={[session]} onDeleted={onDeleted} />)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByTestId('remove-confirm-sx'))
    // Row optimistically removed, undo toast appears
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByTestId('review-badge-sx')).not.toBeInTheDocument()
    // After undo window, DELETE fires
    await vi.advanceTimersByTimeAsync(5100)
    expect(global.fetch).toHaveBeenCalledWith('/api/sessions/sx', { method: 'DELETE' })
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith('sx'))
  })

  it('does not show the delete prompt for partial or ready_to_study states', () => {
    const partial = makeReviewSession({ id: 'sp', review_state: 'partial' })
    const ready = makeReviewSession({ id: 'sr', review_state: 'ready_to_study', saved_count: 1 })
    render(<SessionList sessions={[partial, ready]} />)
    expect(screen.queryByTestId('delete-prompt-sp')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delete-prompt-sr')).not.toBeInTheDocument()
  })
})
