-- Drop Leitner box columns from practice_items table
-- Destructive: existing leitner_box and leitner_due_date data is permanently removed.
ALTER TABLE practice_items
  DROP COLUMN IF EXISTS leitner_box,
  DROP COLUMN IF EXISTS leitner_due_date;
