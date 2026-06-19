// lib/loaders.ts
//
// Single source of truth for the SQL queries that back both the API
// routes and the Server Components. Pulling these out of the route
// handlers means a Server Component can fetch the same data the client
// would have fetched, without going through HTTP — saving a network
// round-trip per navigation and letting Next.js stream the result.
//
// Each loader takes the trusted `userId` from `getAuthenticatedUser()`
// (which middleware has already verified) and scopes every query by it.
// Never accept a userId from request input.

import { createServerClient } from '@/lib/supabase-server'
import type {
  Annotation,
  PracticeItem,
  SessionDetail,
  SessionListItem,
  TranscriptSegment,
} from '@/lib/types'

/**
 * All recent sessions for a user, newest first. Used by the home dashboard
 * (in-progress callout + recent conversations list) and `/api/sessions`.
 */
export async function loadSessions(userId: string): Promise<SessionListItem[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .select('id, title, status, duration_seconds, created_at, processing_completed_at, last_viewed_at')
    .eq('user_id', userId)
    .neq('status', 'error')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as SessionListItem[]
}

/**
 * Full transcript view payload — session row + segments + annotations +
 * derived flags about which annotations the user has saved/written.
 *
 * Returns null if the session doesn't exist, has been deleted, or
 * doesn't belong to this user. The caller should turn null into a 404.
 */
export async function loadSessionDetail(
  userId: string,
  sessionId: string
): Promise<SessionDetail | null> {
  const db = createServerClient()

  const { data: session, error: sessionError } = await db
    .from('sessions')
    .select('id, title, status, error_stage, duration_seconds, detected_speaker_count, user_speaker_labels, created_at, reviewed_at, last_viewed_at')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  if (sessionError || !session) return null

  // Three independent reads scoped to the same session — fire them in
  // parallel so the round-trip cost is the slowest single query, not the
  // sum of all three. PostgREST has no transactional advantage to
  // serialising these.
  const [segmentsRes, annotationsRes, practiceItemsRes] = await Promise.all([
    db
      .from('transcript_segments')
      .select('*')
      .eq('session_id', sessionId)
      .order('position'),
    db
      .from('annotations')
      .select('*')
      .eq('session_id', sessionId),
    db
      .from('practice_items')
      .select('id, annotation_id')
      .eq('session_id', sessionId),
  ])

  const segments = (segmentsRes.data ?? []) as TranscriptSegment[]
  const annotations = (annotationsRes.data ?? []) as Annotation[]
  const practiceItems = (practiceItemsRes.data ?? []) as Array<{
    id: string
    annotation_id: string | null
  }>

  const addedAnnotations: Record<string, string> = {}
  for (const item of practiceItems) {
    if (!item.annotation_id) continue
    addedAnnotations[item.annotation_id] = item.id
  }

  return {
    session,
    segments,
    annotations,
    addedAnnotations,
  }
}

/**
 * Practice items (the Write surface) enriched with the segment text and
 * source-session title that the UI needs to render each row.
 *
 * Old shape: 4 sequential round-trips (sessions → items → annotations →
 * segments). New shape: one PostgREST request that joins through the
 * declared foreign-key relationships in the schema. The caller's wall-
 * clock latency goes from "sum of four serial RTTs" to "one RTT".
 */
export async function loadPracticeItems(
  userId: string,
  options: { sort?: 'created' | 'importance' } = {}
): Promise<PracticeItem[]> {
  const db = createServerClient()

  const orderCol = options.sort === 'importance' ? 'importance_score' : 'created_at'
  const orderOpts = options.sort === 'importance'
    ? { ascending: false, nullsFirst: false }
    : { ascending: false }

  // Nested PostgREST select: pulls the parent session's title and the
  // parent annotation's char offsets + transcript segment text in a
  // single query. The join keys are inferred from the FK constraints
  // declared on these tables in the migrations.
  const { data, error } = await db
    .from('practice_items')
    .select(`
      id, session_id, annotation_id, type, sub_category, original,
      correction, explanation, reviewed, created_at,
      updated_at, flashcard_front, flashcard_back, flashcard_note,
      importance_score, importance_note,
      sessions:sessions!inner(user_id, title),
      annotations:annotations(start_char, end_char, flashcard_front,
        flashcard_back, flashcard_note,
        transcript_segments:transcript_segments(text)
      )
    `)
    .eq('sessions.user_id', userId)
    .order(orderCol, orderOpts)

  if (error) throw new Error(error.message)

  type Joined = PracticeItem & {
    sessions: { user_id: string; title: string | null } | null
    annotations: {
      start_char: number
      end_char: number
      flashcard_front: string | null
      flashcard_back: string | null
      flashcard_note: string | null
      transcript_segments: { text: string } | null
    } | null
  }

  return ((data ?? []) as unknown as Joined[]).map(row => {
    const { sessions, annotations, ...rest } = row
    return {
      ...rest,
      session_title: sessions?.title ?? null,
      start_char: annotations?.start_char ?? null,
      end_char: annotations?.end_char ?? null,
      segment_text: annotations?.transcript_segments?.text ?? null,
      // Fall back to the annotation's flashcard fields for items saved before
      // the pipeline started writing them onto practice_items directly.
      flashcard_front: rest.flashcard_front ?? annotations?.flashcard_front ?? null,
      flashcard_back: rest.flashcard_back ?? annotations?.flashcard_back ?? null,
      flashcard_note: rest.flashcard_note ?? annotations?.flashcard_note ?? null,
    }
  })
}

/**
 * Cheap "does the user have anything yet?" flags. Two `limit(1)` probes
 * fired in parallel — result is `true`/`false` only, not a count.
 */
export interface EmptyAccountFlags {
  hasSessions: boolean
  hasPracticeItems: boolean
}

export async function loadEmptyAccountFlags(
  userId: string,
): Promise<EmptyAccountFlags> {
  const db = createServerClient()
  const [sessionsRes, itemsRes] = await Promise.all([
    db
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .limit(1),
    // Practice items are user-scoped via the parent session row — same
    // pattern as loadPracticeItems above.
    db
      .from('practice_items')
      .select('id, sessions:sessions!inner(user_id)')
      .eq('sessions.user_id', userId)
      .limit(1),
  ])

  return {
    hasSessions: (sessionsRes.data?.length ?? 0) > 0,
    hasPracticeItems: (itemsRes.data?.length ?? 0) > 0,
  }
}

export interface AllowedUserRow {
  email: string
  status: 'pending' | 'approved' | 'denied'
  name: string | null
  avatar_url: string | null
  source: string | null
  requested_at: string
  approved_at: string | null
  user_id: string | null
  geo_country: string | null
  geo_city: string | null
}

export async function loadAllowedUsers(): Promise<AllowedUserRow[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from('allowed_users')
    .select('email, status, name, avatar_url, source, requested_at, approved_at, user_id, geo_country, geo_city')
    .order('requested_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AllowedUserRow[]
}

/**
 * Count of sessions the user has not yet viewed (last_viewed_at IS NULL).
 * Only counts ready sessions — in-progress and errored sessions never
 * appear in the Review inbox so they must not inflate the badge.
 */
export async function loadUnreadCount(userId: string): Promise<number> {
  const db = createServerClient()
  const { count, error } = await db
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'ready')
    .is('last_viewed_at', null)
  if (error) return 0
  return count ?? 0
}
