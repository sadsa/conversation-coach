-- supabase/migrations/20260325000000_add_flashcard_fields.sql
ALTER TABLE annotations
  ADD COLUMN IF NOT EXISTS flashcard_front text,
  ADD COLUMN IF NOT EXISTS flashcard_back  text,
  ADD COLUMN IF NOT EXISTS flashcard_note  text;

ALTER TABLE practice_items
  ADD COLUMN IF NOT EXISTS flashcard_front text,
  ADD COLUMN IF NOT EXISTS flashcard_back  text,
  ADD COLUMN IF NOT EXISTS flashcard_note  text;
