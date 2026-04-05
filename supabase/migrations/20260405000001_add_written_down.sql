-- supabase/migrations/20260405000001_add_written_down.sql
ALTER TABLE practice_items
  ADD COLUMN IF NOT EXISTS written_down boolean NOT NULL DEFAULT false;
