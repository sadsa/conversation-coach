-- supabase/migrations/20260405000000_add_push_subscriptions.sql
-- Stores the user's Web Push subscription so the server can send push notifications
-- when a session finishes analysing. Single-row table — id is always 1.
create table push_subscriptions (
  id         integer primary key default 1 check (id = 1),
  endpoint   text        not null,
  p256dh     text        not null,
  auth       text        not null,
  updated_at timestamptz not null default now()
);

create trigger set_push_subscriptions_updated_at
  before update on push_subscriptions
  for each row execute procedure set_updated_at();
