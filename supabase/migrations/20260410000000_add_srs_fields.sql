-- supabase/migrations/20260410000000_add_srs_fields.sql
ALTER TABLE practice_items
  ADD COLUMN IF NOT EXISTS fsrs_state      text,
  ADD COLUMN IF NOT EXISTS due             timestamptz,
  ADD COLUMN IF NOT EXISTS stability       float8,
  ADD COLUMN IF NOT EXISTS difficulty      float8,
  ADD COLUMN IF NOT EXISTS elapsed_days    float8,
  ADD COLUMN IF NOT EXISTS scheduled_days  float8,
  ADD COLUMN IF NOT EXISTS reps            int4,
  ADD COLUMN IF NOT EXISTS lapses          int4,
  ADD COLUMN IF NOT EXISTS last_review     timestamptz;
