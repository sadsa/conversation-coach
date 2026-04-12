-- Relax the transcript_segments.speaker check constraint.
-- AssemblyAI uses alphabetical speaker labels (A, B, C, ...) and is not limited to two
-- even when speakers_expected is set. The original constraint (speaker in ('A', 'B'))
-- causes insert failures when a third label appears.
ALTER TABLE transcript_segments DROP CONSTRAINT transcript_segments_speaker_check;
ALTER TABLE transcript_segments ADD CONSTRAINT transcript_segments_speaker_check
  CHECK (speaker ~ '^[A-Z]$');
