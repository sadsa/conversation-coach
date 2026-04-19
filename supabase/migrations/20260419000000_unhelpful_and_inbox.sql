-- supabase/migrations/20260419000000_unhelpful_and_inbox.sql
--
-- Adds two orthogonal features:
--
--   1. annotations.is_unhelpful (+ unhelpful_at):
--      Lets the user flag a Claude-generated correction as unhelpful so we can
--      later mine the "marked unhelpful vs saved as practice item" delta to
--      tune the analysis prompt. is_unhelpful is the queryable signal;
--      unhelpful_at is for trend analysis and to support future "auto-restore
--      after N days" UX without losing the original toggle moment.
--
--   2. sessions.last_viewed_at:
--      Treat the recent-conversations list as an inbox. NULL means unread;
--      a timestamp means the user has opened the transcript at least once.
--      Auto-populated on first /sessions/[id] view; user can flip back to
--      unread (NULL) explicitly from the transcript page menu.
--
-- Both columns are additive and default to "no signal" so existing rows keep
-- their current behaviour with no backfill required.

alter table annotations
  add column if not exists is_unhelpful boolean not null default false,
  add column if not exists unhelpful_at timestamptz;

create index if not exists annotations_is_unhelpful_idx
  on annotations (session_id)
  where is_unhelpful = true;

alter table sessions
  add column if not exists last_viewed_at timestamptz;

-- Used by the recent-sessions "Unread" filter. Partial index keeps it tiny:
-- once a session is read it disappears from the index, since the inbox view
-- only ever filters the unread side.
create index if not exists sessions_unread_idx
  on sessions (user_id, created_at desc)
  where last_viewed_at is null;
