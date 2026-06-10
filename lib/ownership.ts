// lib/ownership.ts
//
// The single seam every owned-resource route crosses to answer one
// question: "does this signed-in user own this row?" Before this module,
// that proof was written three+ ways and inlined across ~11 routes — and
// missing entirely from DELETE /api/sessions/:id (any signed-in user could
// delete any session by id).
//
// Two ownership shapes live in the schema:
//   1. Directly owned   — the row carries `user_id` (e.g. `sessions`).
//   2. Owned via session — the row carries `session_id`, and ownership is
//      chained through `sessions.user_id` (e.g. `annotations`,
//      `practice_items`).
//
// All callers pass the already-resolved `user.id` from getAuthenticatedUser
// (which reads middleware-forwarded headers, zero network calls). This seam
// must NOT re-authenticate — it only queries ownership.
//
// Convention preserved: routes return 404 (not 403) for an unowned resource,
// so callers map a falsy/null result straight to "Not found".

import { createServerClient } from '@/lib/supabase-server'

type Db = ReturnType<typeof createServerClient>

/**
 * Fetch the requested columns of a directly-owned session, scoped to the
 * owner. Returns the row, or null when the session doesn't exist or isn't
 * owned by `userId`. The `.eq('user_id', ...)` does double duty here —
 * ownership enforcement and data scoping — so data-fetching routes can keep
 * a single query instead of a separate ownership check plus a read.
 *
 * `columns` is a PostgREST select string; defaults to `'id'` for callers
 * that only need the existence/ownership signal.
 */
export async function getOwnedSession<T = Record<string, unknown>>(
  db: Db,
  sessionId: string,
  userId: string,
  columns: string = 'id',
): Promise<T | null> {
  const { data } = await db
    .from('sessions')
    .select(columns)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  return (data as T) ?? null
}

/**
 * Boolean ownership check for a directly-owned session. Use when the route
 * only needs to gate on ownership and doesn't read any session columns.
 */
export async function verifyOwnedSession(
  db: Db,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  return (await getOwnedSession(db, sessionId, userId, 'id')) !== null
}

/**
 * Boolean ownership check for a resource owned via its parent session
 * (shape 2). Looks up the row's `session_id`, then proves the parent session
 * belongs to `userId`. Dedupes the byte-for-byte `verifyOwnership` helpers
 * that lived in the annotations and practice-items routes.
 *
 * `table` is the child table (`'annotations'`, `'practice_items'`); `id` is
 * the child row's id.
 */
export async function verifyOwnedViaSession(
  db: Db,
  table: 'annotations' | 'practice_items',
  id: string,
  userId: string,
): Promise<boolean> {
  const { data: row } = await db
    .from(table)
    .select('session_id')
    .eq('id', id)
    .single()

  if (!row) return false

  return verifyOwnedSession(db, (row as { session_id: string }).session_id, userId)
}
