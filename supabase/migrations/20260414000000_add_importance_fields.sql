-- supabase/migrations/20260414000000_add_importance_fields.sql
ALTER TABLE annotations
  ADD COLUMN IF NOT EXISTS importance_score smallint,
  ADD COLUMN IF NOT EXISTS importance_note  text;

ALTER TABLE practice_items
  ADD COLUMN IF NOT EXISTS importance_score smallint,
  ADD COLUMN IF NOT EXISTS importance_note  text;
