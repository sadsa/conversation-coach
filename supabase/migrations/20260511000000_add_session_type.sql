-- supabase/migrations/20260511000000_add_session_type.sql
ALTER TABLE sessions
  ADD COLUMN session_type text NOT NULL DEFAULT 'upload'
  CHECK (session_type IN ('upload', 'voice_practice'));
