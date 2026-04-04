-- supabase/migrations/20260404221705_add_speakers_expected.sql
-- Persist the user's speaker-count intent so the webhook can honour solo mode
-- even when AssemblyAI detects more speakers than expected.
alter table sessions add column speakers_expected int;
