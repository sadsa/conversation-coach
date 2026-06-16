-- Drop written_down from practice_items.
-- The studied/pending distinction has been removed by design; all vocabulary
-- items are now equal-state. The column is no longer read or written by any
-- application code.
ALTER TABLE practice_items DROP COLUMN written_down;
