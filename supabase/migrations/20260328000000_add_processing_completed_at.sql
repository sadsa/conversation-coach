-- supabase/migrations/20260328000000_add_processing_completed_at.sql
alter table sessions
  add column if not exists processing_completed_at timestamptz;
