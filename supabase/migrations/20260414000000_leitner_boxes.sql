-- supabase/migrations/20260414000000_leitner_boxes.sql

-- Drop FSRS columns
ALTER TABLE practice_items
  DROP COLUMN IF EXISTS fsrs_state,
  DROP COLUMN IF EXISTS due,
  DROP COLUMN IF EXISTS stability,
  DROP COLUMN IF EXISTS difficulty,
  DROP COLUMN IF EXISTS elapsed_days,
  DROP COLUMN IF EXISTS scheduled_days,
  DROP COLUMN IF EXISTS reps,
  DROP COLUMN IF EXISTS lapses,
  DROP COLUMN IF EXISTS last_review;

-- Add Leitner columns
ALTER TABLE practice_items
  ADD COLUMN IF NOT EXISTS leitner_box      int4 DEFAULT 1,
  ADD COLUMN IF NOT EXISTS leitner_due_date date;

-- Backfill: cards already written down start in box 1 due today
UPDATE practice_items
SET leitner_box = 1,
    leitner_due_date = CURRENT_DATE
WHERE written_down = true
  AND flashcard_front IS NOT NULL
  AND flashcard_back IS NOT NULL
  AND leitner_due_date IS NULL;
