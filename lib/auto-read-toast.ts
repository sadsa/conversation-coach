// lib/auto-read-toast.ts
//
// One-shot handoff between the transcript page (writer) and the home page
// (reader) for the "Marked as read · Undo" toast.
//
// Why sessionStorage and not a query param?
//   - sessionStorage is per-tab, so an open transcript in another tab can't
//     race with this one.
//   - The home URL stays clean; no `/?undoRead=<id>` to re-trigger on reload.
//   - It's intentionally consumed (read + cleared) on the home page so the
//     toast fires exactly once per auto-read.
//
// We also stamp a timestamp and discard anything older than `STASH_TTL_MS`
// — otherwise a session opened weeks ago in the same tab session could
// surface a stale "Marked as read" toast on next visit.

const STASH_KEY = 'autoReadToast'
const STASH_TTL_MS = 60_000

export interface AutoReadStash {
  id: string
  title: string
  /** Wall-clock ms when the stash was written. */
  at: number
}

interface RawStash {
  id?: unknown
  title?: unknown
  at?: unknown
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

/**
 * Called by the transcript page once we know the auto-read POST actually
 * flipped the row's read state for the first time. Idempotent — overwriting
 * an existing stash is fine; the most recent auto-read is the only one a
 * user could meaningfully undo.
 */
export function stashAutoRead(id: string, title: string): void {
  if (!isBrowser()) return
  try {
    const payload: AutoReadStash = { id, title, at: Date.now() }
    window.sessionStorage.setItem(STASH_KEY, JSON.stringify(payload))
  } catch {
    // Quota exceeded or storage disabled (private mode in some browsers).
    // The toast is a nice-to-have; failing silently is correct.
  }
}

/**
 * Called by the home page on mount. Returns the stashed value (if any and
 * still fresh) and removes it from storage so the next visit doesn't
 * re-show the same toast.
 */
export function consumePendingAutoReadToast(): AutoReadStash | null {
  if (!isBrowser()) return null
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(STASH_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    window.sessionStorage.removeItem(STASH_KEY)
  } catch {
    // Couldn't clear — surface the toast anyway, but a future visit might
    // re-show it. Acceptable trade-off.
  }

  let parsed: RawStash
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const id = typeof parsed.id === 'string' ? parsed.id : null
  const title = typeof parsed.title === 'string' ? parsed.title : null
  const at = typeof parsed.at === 'number' ? parsed.at : null

  if (!id || !title || at == null) return null
  if (Date.now() - at > STASH_TTL_MS) return null

  return { id, title, at }
}
