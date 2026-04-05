create table push_subscriptions (
  id         integer primary key default 1,
  endpoint   text        not null,
  p256dh     text        not null,
  auth       text        not null,
  updated_at timestamptz not null default now()
);
