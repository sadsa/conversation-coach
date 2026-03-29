-- supabase/migrations/20260329000001_enable_rls.sql
-- Run this AFTER backfilling user_id on all existing sessions.
--
-- Backfill first (run in Supabase SQL Editor):
--   update sessions set user_id = '<your-auth-uuid>' where user_id is null;
--   select count(*) from sessions where user_id is null;  -- must return 0
--
-- Then apply this migration.

alter table sessions alter column user_id set not null;

alter table sessions enable row level security;

create policy "Users see own sessions"
  on sessions for all
  using (auth.uid() = user_id);
