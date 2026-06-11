create table events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  event       text not null,
  properties  jsonb default '{}',
  occurred_at timestamptz not null default now()
);

create index on events (user_id, event, occurred_at);

alter table events enable row level security;

create policy "Users can read own events"
  on events for select
  using (user_id = auth.uid());
