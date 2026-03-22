-- supabase/migrations/20260322000000_add_sub_category.sql
ALTER TABLE annotations
  ADD COLUMN IF NOT EXISTS sub_category text NOT NULL DEFAULT 'other';

ALTER TABLE practice_items
  ADD COLUMN IF NOT EXISTS sub_category text NOT NULL DEFAULT 'other';
