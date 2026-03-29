-- supabase/migrations/20260329000000_add_user_id_to_sessions.sql
-- Adds user_id as nullable initially so existing rows are preserved.
-- RLS is NOT enabled here — enable it only after the backfill (migration 20260329000001).

alter table sessions
  add column user_id uuid references auth.users(id) on delete cascade;
