-- supabase/migrations/20260614000000_reviewed_at.sql
--
-- Adds sessions.reviewed_at to track deliberate review completion — separate
-- from last_viewed_at (which marks "opened") so the two concepts stay distinct.
--
-- NULL = never explicitly reviewed. Timestamp = user tapped "Mark as reviewed".
-- Set only by the explicit user action in PATCH /api/sessions/:id.
--
-- The unreviewed badge on the nav counts sessions where reviewed_at IS NULL
-- (excluding errored ones); the partial index keeps it fast.

alter table sessions
  add column if not exists reviewed_at timestamptz;

create index if not exists sessions_unreviewed_idx
  on sessions (user_id, created_at desc)
  where reviewed_at is null and status != 'error';
