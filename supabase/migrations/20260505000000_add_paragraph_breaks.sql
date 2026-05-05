-- supabase/migrations/20260505000000_add_paragraph_breaks.sql
--
-- Adds a paragraph_breaks column to transcript_segments to support
-- reader-friendly paragraph rendering of long monologue utterances.
--
-- Each value in the array is a character offset into segment.text where
-- a new paragraph begins after the first. The first paragraph always
-- starts at offset 0, which is implicit and NOT stored in the array.
-- An empty array means the segment renders as a single paragraph
-- (the legacy / pre-migration behaviour).
--
-- This is additive: existing rows pick up the default '{}' immediately
-- and continue to render as a single block — pixel-identical to today.
-- New sessions will have this populated by the webhook handler from
-- AssemblyAI's /v2/transcript/:id/paragraphs response.

alter table transcript_segments
  add column paragraph_breaks int[] not null default '{}';
