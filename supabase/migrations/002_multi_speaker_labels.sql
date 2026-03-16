-- Migration: replace user_speaker_label (text) with user_speaker_labels (text[])
-- Rollback SQL:
--   ALTER TABLE sessions ADD COLUMN user_speaker_label text;
--   UPDATE sessions SET user_speaker_label = user_speaker_labels[1] WHERE user_speaker_labels IS NOT NULL;
--   ALTER TABLE sessions DROP COLUMN user_speaker_labels;

ALTER TABLE sessions
  ADD COLUMN user_speaker_labels text[]
    CHECK (user_speaker_labels <@ ARRAY['A','B']::text[]);

UPDATE sessions
  SET user_speaker_labels = ARRAY[user_speaker_label]
  WHERE user_speaker_label IS NOT NULL;

ALTER TABLE sessions DROP COLUMN user_speaker_label;
