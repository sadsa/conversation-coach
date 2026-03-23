-- supabase/migrations/20260323000000_insights_rpc_practice_filter.sql

-- 1. Delete existing strength data (must happen before enum change)
DELETE FROM practice_items WHERE type = 'strength';
DELETE FROM annotations WHERE type = 'strength';

-- 2. Rebuild annotation_type enum without 'strength'
ALTER TYPE annotation_type RENAME TO annotation_type_old;
CREATE TYPE annotation_type AS ENUM ('grammar', 'naturalness');

ALTER TABLE annotations
  ALTER COLUMN type TYPE annotation_type USING type::text::annotation_type;

ALTER TABLE practice_items
  ALTER COLUMN type TYPE annotation_type USING type::text::annotation_type;

DROP TYPE annotation_type_old;

-- 3. Drop the strength RPC (no longer called)
DROP FUNCTION IF EXISTS get_subcategory_strength_counts();

-- 4. Replace error count RPC — scoped to practice-saved annotations only
CREATE OR REPLACE FUNCTION get_subcategory_error_counts()
RETURNS TABLE (
  sub_category text,
  type text,
  total_count bigint,
  session_count bigint
) AS $$
  SELECT
    a.sub_category,
    a.type::text,
    COUNT(*) AS total_count,
    COUNT(DISTINCT a.session_id) AS session_count
  FROM annotations a
  JOIN sessions s ON a.session_id = s.id
  WHERE s.status = 'ready'
    AND a.type IN ('grammar', 'naturalness')
    AND a.sub_category != 'other'
    AND EXISTS (SELECT 1 FROM practice_items pi WHERE pi.annotation_id = a.id)
  GROUP BY a.sub_category, a.type
  ORDER BY total_count DESC
$$ LANGUAGE sql STABLE;

-- 5. Replace per-session counts RPC — scoped to practice-saved annotations only
CREATE OR REPLACE FUNCTION get_subcategory_session_counts()
RETURNS TABLE (
  sub_category text,
  session_id uuid,
  created_at timestamptz,
  error_count bigint,
  user_turn_count bigint
) AS $$
  SELECT
    a.sub_category,
    a.session_id,
    s.created_at,
    COUNT(*) AS error_count,
    (
      SELECT COUNT(*) FROM transcript_segments ts
      WHERE ts.session_id = a.session_id
        AND ts.speaker = ANY(COALESCE(s.user_speaker_labels, ARRAY[]::text[]))
    ) AS user_turn_count
  FROM annotations a
  JOIN sessions s ON a.session_id = s.id
  WHERE s.status = 'ready'
    AND a.type IN ('grammar', 'naturalness')
    AND a.sub_category != 'other'
    AND EXISTS (SELECT 1 FROM practice_items pi WHERE pi.annotation_id = a.id)
  GROUP BY a.sub_category, a.session_id, s.created_at, s.user_speaker_labels
  ORDER BY s.created_at DESC
$$ LANGUAGE sql STABLE;

-- 6. Replace examples RPC — scoped to practice-saved annotations only
CREATE OR REPLACE FUNCTION get_subcategory_examples()
RETURNS TABLE (
  sub_category text,
  original text,
  correction text,
  start_char int,
  end_char int,
  segment_text text,
  session_title text,
  session_created_at timestamptz
) AS $$
  SELECT
    a.sub_category,
    a.original,
    a.correction,
    a.start_char,
    a.end_char,
    ts.text AS segment_text,
    s.title AS session_title,
    s.created_at AS session_created_at
  FROM (
    SELECT ann.*,
      ROW_NUMBER() OVER (PARTITION BY ann.sub_category ORDER BY s_inner.created_at DESC) AS row_num
    FROM annotations ann
    JOIN sessions s_inner ON ann.session_id = s_inner.id
    WHERE ann.sub_category != 'other'
      AND ann.type IN ('grammar', 'naturalness')
      AND s_inner.status = 'ready'
      AND EXISTS (SELECT 1 FROM practice_items pi WHERE pi.annotation_id = ann.id)
  ) a
  JOIN transcript_segments ts ON a.segment_id = ts.id
  JOIN sessions s ON a.session_id = s.id
  WHERE a.row_num <= 2
  ORDER BY a.sub_category, a.row_num
$$ LANGUAGE sql STABLE;
