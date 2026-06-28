-- 20260629000000_wild_capture.sql
-- Wild Capture: let users add phrases heard outside the app to their Vocabulary.
-- A new `source` column tags each row as annotation-derived or manually entered.
-- Manual items have no parent session, so session_id becomes nullable and a
-- direct user_id FK is added for ownership scoping of those rows.

alter table practice_items add column source text not null default 'annotation';
alter table practice_items alter column session_id drop not null;
alter table practice_items add column user_id uuid references auth.users(id) on delete cascade;

-- Constraint: every row must be traceable to a user via either path.
-- annotation-derived items: session_id not null (traces via sessions.user_id)
-- manual items: user_id not null
alter table practice_items add constraint practice_items_ownership_check
  check (
    (source = 'annotation' and session_id is not null) or
    (source = 'manual'     and user_id   is not null)
  );
