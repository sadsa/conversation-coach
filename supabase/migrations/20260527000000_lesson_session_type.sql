-- supabase/migrations/20260527000000_lesson_session_type.sql
--
-- Adds 'lesson' as a valid session_type and a lesson_phrase JSONB column
-- that records the Study item that seeded the lesson.
-- lesson_phrase shape: { correction, explanation, flashcard_front, practice_item_id }

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_session_type_check;

-- Re-add the constraint (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_session_type_check'
      AND conrelid = 'sessions'::regclass
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_session_type_check
      CHECK (session_type IN ('upload', 'voice_practice', 'lesson'));
  END IF;
END $$;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS lesson_phrase jsonb;
