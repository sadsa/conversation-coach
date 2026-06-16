-- Backfill flashcard fields onto practice_items that were saved before the
-- pipeline started writing them. Copies from the still-linked annotation
-- where the practice_item has null flashcard_front but the annotation has it.
UPDATE practice_items pi
SET
  flashcard_front = a.flashcard_front,
  flashcard_back  = a.flashcard_back,
  flashcard_note  = a.flashcard_note
FROM annotations a
WHERE pi.annotation_id = a.id
  AND pi.flashcard_front IS NULL
  AND a.flashcard_front IS NOT NULL;
