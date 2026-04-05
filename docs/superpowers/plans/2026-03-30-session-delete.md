# Session Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add swipe-left-to-delete on the Past Sessions list, with a confirmation modal warning that annotations and practice items will be permanently removed.

**Architecture:** Convert `SessionList` to a `'use client'` component with a `SwipeableSessionItem` sub-component (mirrors `PracticeList`'s `SwipeableItem`). Add a `DELETE /api/sessions/:id` handler. `page.tsx` passes an `onDeleted` callback that clears the polling interval and removes the session from state.

**Tech Stack:** React (useState, useRef, useEffect), `react-swipeable` (already installed), existing `Modal` component, Supabase (DB cascade deletes already in place)

---

## File Map

| File | Change |
|---|---|
| `app/api/sessions/[id]/route.ts` | Add `DELETE` handler |
| `components/SessionList.tsx` | Convert to `'use client'`, add `SwipeableSessionItem`, add `onDeleted` prop |
| `app/page.tsx` | Pass `onDeleted` handler to `<SessionList>` |
| `__tests__/api/sessions.test.ts` | Add `DELETE` tests |
| `__tests__/components/SessionList.test.tsx` | Add swipe-to-delete tests, update Link mock |

---

## Task 1: DELETE API Endpoint

**Files:**
- Modify: `app/api/sessions/[id]/route.ts`
- Modify: `__tests__/api/sessions.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/api/sessions.test.ts`. The existing file already imports `getDetail` and `PATCH` from the route — add `DELETE` to that import:

```ts
// Change this existing import line:
import { GET as getDetail, PATCH } from '@/app/api/sessions/[id]/route'
// To:
import { GET as getDetail, PATCH, DELETE } from '@/app/api/sessions/[id]/route'
```

Then add these two test blocks after the existing `PATCH` describe block:

```ts
describe('DELETE /api/sessions/:id', () => {
  it('deletes the session and returns ok', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: eqMock }) }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: 'sess-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    expect(eqMock).toHaveBeenCalledWith('id', 'sess-1')
  })

  it('returns 500 when the database delete fails', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: { message: 'DB error' } })
    const mockDb = {
      from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: eqMock }) }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: 'sess-1' } })
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: FAIL — `DELETE` is not exported from the route.

- [ ] **Step 3: Add the DELETE handler**

Add to the bottom of `app/api/sessions/[id]/route.ts`:

```ts
export async function DELETE(_req: NextRequest, { params }: Params) {
  const db = createServerClient()
  const { error } = await db
    .from('sessions')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/[id]/route.ts __tests__/api/sessions.test.ts
git commit -m "feat: add DELETE /api/sessions/:id endpoint"
```

---

## Task 2: SwipeableSessionItem Component

**Files:**
- Modify: `components/SessionList.tsx`
- Modify: `__tests__/components/SessionList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `__tests__/components/SessionList.test.tsx` with:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/components/SessionList.test.tsx
```

Expected: The original tests PASS (component still exists), but the new `swipe to delete` tests FAIL — `delete-session-sess-1` testid not found.

- [ ] **Step 3: Replace SessionList.tsx**

Replace the entire contents of `components/SessionList.tsx` with:

```tsx
// components/SessionList.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSwipeable } from 'react-swipeable'
import { Modal } from '@/components/Modal'
import type { SessionListItem } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  uploading: 'Uploading…',
  transcribing: 'Transcribing…',
  identifying: 'Awaiting speaker ID',
  analysing: 'Analysing…',
  ready: 'Ready',
  error: 'Error',
}

const STATUS_COLOUR: Record<string, string> = {
  ready: 'text-green-400',
  error: 'text-red-400',
}

const TERMINAL_STATUSES = new Set(['ready', 'error'])

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function SwipeableSessionItem({
  session,
  onDelete,
}: {
  session: SessionListItem
  onDelete: (id: string) => Promise<boolean>
}) {
  const [translateX, setTranslateX] = useState(0)
  const [rowHeight, setRowHeight] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [confirmPending, setConfirmPending] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  async function triggerDelete() {
    if (isAnimating || !rowRef.current) return
    setIsAnimating(true)

    // Phase 1: slide item fully off-screen left (200ms)
    setTranslateX(-window.innerWidth)
    const deletePromise = onDelete(session.id)

    await new Promise(r => setTimeout(r, 200))
    if (!mountedRef.current) return

    // Phase 2: measure height, then collapse row
    const h = rowRef.current?.offsetHeight ?? 0
    setRowHeight(h)
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    if (!mountedRef.current) return
    setRowHeight(0)

    // Wait for both collapse animation and DELETE to finish
    const [, deleteResult] = await Promise.allSettled([
      new Promise(r => setTimeout(r, 200)),
      deletePromise,
    ])
    if (!mountedRef.current) return

    const succeeded = deleteResult.status === 'fulfilled' && deleteResult.value === true

    if (!succeeded) {
      // Restore item on failure
      setRowHeight(null)
      setTranslateX(0)
      setIsAnimating(false)
    }
    // On success: parent removes item from list via onDeleted (called inside onDelete)
  }

  const handlers = useSwipeable({
    delta: 10,
    onSwiping: (e) => {
      if (e.dir === 'Left') setTranslateX(-e.absX)
      else setTranslateX(0)
    },
    onSwipedLeft: (e) => {
      if (e.absX > 80) {
        setTranslateX(0)
        setConfirmPending(true)
      } else {
        setTranslateX(0)
      }
    },
    onSwipedRight: () => setTranslateX(0),
    trackMouse: false,
  })

  const isProcessing = !TERMINAL_STATUSES.has(session.status)
  const processingSeconds =
    session.status === 'ready' && session.processing_completed_at
      ? Math.round(
          (new Date(session.processing_completed_at).getTime() - new Date(session.created_at).getTime()) / 1000
        )
      : null

  return (
    <li
      ref={rowRef}
      className="relative overflow-hidden"
      style={
        rowHeight !== null
          ? { height: rowHeight, transition: 'height 0.2s ease', overflow: 'hidden' }
          : undefined
      }
    >
      {/* Swipe-to-delete background */}
      <div className="absolute inset-0 bg-red-600 flex items-center justify-end pr-5">
        <span className="text-white text-sm font-medium">Delete</span>
      </div>

      {/* Session card */}
      <div
        {...handlers}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating
            ? 'transform 0.2s ease'
            : translateX === 0
            ? 'transform 0.2s'
            : 'none',
          userSelect: 'none',
          touchAction: 'pan-y',
        }}
        className={`relative ${isProcessing ? 'border-l-2 border-indigo-600 bg-[#0d0f1e]' : 'bg-[#0a0c1a]'}`}
      >
        {/* Hidden test seam for triggering delete in tests */}
        <button
          data-testid={`delete-session-${session.id}`}
          className="sr-only"
          onClick={e => { e.stopPropagation(); setConfirmPending(true) }}
          tabIndex={-1}
          aria-hidden="true"
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — inert is a valid HTML attribute not yet in React's types
          inert=""
        />
        <Link
          href={session.status === 'ready' ? `/sessions/${session.id}` : `/sessions/${session.id}/status`}
          onClick={(e) => { if (isAnimating || translateX !== 0) e.preventDefault() }}
          className={`flex items-center gap-3 py-3 min-w-0 ${isProcessing ? 'pl-3' : ''}`}
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-gray-100">{session.title}</p>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5 flex-wrap">
              <span className={`flex items-center gap-1 ${STATUS_COLOUR[session.status] ?? 'text-gray-400'}`}>
                {isProcessing && (
                  <svg
                    className="w-3 h-3 animate-spin text-indigo-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                {STATUS_LABEL[session.status] ?? session.status}
              </span>
              <span>·</span>
              <span>{new Date(session.created_at).toLocaleDateString()}</span>
              {session.duration_seconds != null && (
                <>
                  <span>·</span>
                  <span>{formatDuration(session.duration_seconds)}</span>
                </>
              )}
              {processingSeconds != null && (
                <>
                  <span>·</span>
                  <span className="text-indigo-400">⚡ {formatDuration(processingSeconds)}</span>
                </>
              )}
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="w-4 h-4 text-gray-600 flex-shrink-0" aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>

      {/* Confirmation modal — uses fixed positioning, unaffected by overflow:hidden */}
      {confirmPending && (
        <Modal title="Delete session?" onClose={() => setConfirmPending(false)}>
          <div className="space-y-4 text-sm">
            <p className="text-gray-300 leading-relaxed">
              <strong className="text-gray-100">{session.title}</strong> will be permanently
              deleted, along with all its annotations and any practice items you've saved from it.
              This can't be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmPending(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmPending(false); triggerDelete() }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </li>
  )
}

interface Props {
  sessions: SessionListItem[]
  onDeleted?: (id: string) => void
}

export function SessionList({ sessions, onDeleted }: Props) {
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(t)
  }, [toastMessage])

  async function deleteSession(id: string): Promise<boolean> {
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setToastMessage("Couldn't delete session — try again.")
      return false
    }
    onDeleted?.(id)
    return true
  }

  if (sessions.length === 0) {
    return <p className="text-gray-500 text-sm">No sessions yet — upload your first conversation above.</p>
  }

  return (
    <div>
      <ul className="divide-y divide-gray-800">
        {sessions.map(s => (
          <SwipeableSessionItem
            key={s.id}
            session={s}
            onDelete={deleteSession}
          />
        ))}
      </ul>

      {toastMessage && (
        <div
          role="alert"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  )
}
```

**Note on the processing-row left border:** The original used `border-l-2 -ml-3 pl-3` on the `<Link>` to pin the indigo border to the row's left edge. The new approach puts `border-l-2` on the outer `<div>` (which naturally sits at the row's left edge) and `pl-3` on the `<Link>` for content indent. Visually identical, but no negative-margin hack needed and compatible with `overflow: hidden` on the `<li>`.

- [ ] **Step 4: Run tests to verify they all pass**

```bash
npm test -- __tests__/components/SessionList.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/SessionList.tsx __tests__/components/SessionList.test.tsx
git commit -m "feat: add swipe-to-delete with confirmation modal to SessionList"
```

---

## Task 3: Wire Up onDeleted in page.tsx

**Files:**
- Modify: `app/page.tsx`

No new tests — the callback is a trivial one-liner and the delete flow is covered by SessionList's own tests.

- [ ] **Step 1: Add the handler and pass it to SessionList**

In `app/page.tsx`, add `handleSessionDeleted` inside the `HomePage` component, just before the `return` statement:

```ts
function handleSessionDeleted(id: string) {
  const interval = pollingRefs.current.get(id)
  if (interval) {
    clearInterval(interval)
    pollingRefs.current.delete(id)
  }
  setSessions(prev => prev.filter(s => s.id !== id))
}
```

Then update the `<SessionList>` JSX (currently near the bottom of the render):

```tsx
// Before:
<SessionList sessions={sessions} />

// After:
<SessionList sessions={sessions} onDeleted={handleSessionDeleted} />
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: All tests PASS. No regressions.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire up session delete in home page, stop polling on delete"
```

---

## Self-Review

**Spec coverage:**
- ✅ Swipe-left reveals red Delete label — `SwipeableSessionItem` swipe handlers
- ✅ Swipe > 80px threshold triggers confirmation — `onSwipedLeft` check
- ✅ Modal warns about annotations + practice items — modal body copy
- ✅ Cancel closes modal without deleting — `setConfirmPending(false)` only
- ✅ Confirm triggers slide-out + collapse animation — `triggerDelete()`
- ✅ DELETE API endpoint with cascade — Task 1 + DB cascades confirmed in `001_initial.sql`
- ✅ Failed delete shows toast, restores row — `deleteSession` sets `toastMessage`; `triggerDelete` restores state when `succeeded === false`
- ✅ Polling stopped on delete — `handleSessionDeleted` clears interval

**Type consistency:** `onDelete: (id: string) => Promise<boolean>` defined in `SwipeableSessionItem` props matches `deleteSession` signature in `SessionList`. `onDeleted: (id: string) => void` in `SessionList` props matches `handleSessionDeleted` in `page.tsx`.

**No placeholders or TODOs.**
