-- supabase/migrations/20260614000001_backfill_reviewed_at.sql
--
-- Backfills reviewed_at for sessions the user has already opened.
-- The reviewed_at column was added in 20260614000000 with no backfill,
-- leaving all existing sessions at NULL and triggering a spurious 99+ badge
-- for any user with more than 99 sessions. Sessions with last_viewed_at set
-- have been deliberately opened, so treating them as reviewed is correct.
-- Sessions with status = 'error' are excluded from the badge already, so
-- they're left as-is.

update sessions
set reviewed_at = last_viewed_at
where last_viewed_at is not null
  and reviewed_at is null;
