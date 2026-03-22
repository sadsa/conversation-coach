-- supabase/migrations/20260322000001_insights_rpc.sql

-- Returns all-time error/naturalness counts grouped by sub_category
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
  GROUP BY a.sub_category, a.type
  ORDER BY total_count DESC
$$ LANGUAGE sql STABLE;

-- Returns all-time strength counts grouped by sub_category
CREATE OR REPLACE FUNCTION get_subcategory_strength_counts()
RETURNS TABLE (
  sub_category text,
  total_count bigint,
  session_count bigint
) AS $$
  SELECT
    a.sub_category,
    COUNT(*) AS total_count,
    COUNT(DISTINCT a.session_id) AS session_count
  FROM annotations a
  JOIN sessions s ON a.session_id = s.id
  WHERE s.status = 'ready'
    AND a.type = 'strength'
    AND a.sub_category != 'other'
  GROUP BY a.sub_category
  ORDER BY total_count DESC
$$ LANGUAGE sql STABLE;

-- Returns per-session error counts and user turn counts for trend calculation
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
      WHERE ts.session_id = s.id
        AND ts.speaker = ANY(COALESCE(s.user_speaker_labels, ARRAY[]::text[]))
    ) AS user_turn_count
  FROM annotations a
  JOIN sessions s ON a.session_id = s.id
  WHERE s.status = 'ready'
    AND a.type IN ('grammar', 'naturalness')
    AND a.sub_category != 'other'
  GROUP BY a.sub_category, a.session_id, s.created_at, s.user_speaker_labels
  ORDER BY s.created_at DESC
$$ LANGUAGE sql STABLE;

-- Returns up to 2 example annotations per sub_category (most recent first)
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
  ) a
  JOIN transcript_segments ts ON a.segment_id = ts.id
  JOIN sessions s ON a.session_id = s.id
  WHERE a.row_num <= 2
  ORDER BY a.sub_category, a.row_num
$$ LANGUAGE sql STABLE;
