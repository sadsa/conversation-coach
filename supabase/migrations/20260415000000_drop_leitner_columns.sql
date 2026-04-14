-- Drop Leitner box columns from practice_items table
ALTER TABLE practice_items
  DROP COLUMN IF EXISTS leitner_box,
  DROP COLUMN IF EXISTS leitner_due_date;
