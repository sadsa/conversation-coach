create type access_status as enum ('pending', 'approved', 'denied');

create table public.allowed_users (
  email          text primary key,
  status         access_status not null default 'pending',
  requested_at   timestamptz   not null default now(),
  approved_at    timestamptz,
  approved_by    text,
  user_id        uuid references auth.users(id) on delete set null,
  name           text,
  avatar_url     text,
  source         text
);

create index allowed_users_status_pending_idx
  on public.allowed_users (status, requested_at desc)
  where status = 'pending';

alter table public.allowed_users enable row level security;

-- All access via SECURITY DEFINER functions or service-role client only.
-- No direct client access.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.allowed_users (email, status, user_id, name, avatar_url, source)
  values (
    lower(new.email),
    'pending',
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    case
      when new.raw_app_meta_data->>'provider' = 'google' then 'google'
      else 'magic_link'
    end
  )
  on conflict (email) do update set
    user_id    = excluded.user_id,
    name       = coalesce(public.allowed_users.name, excluded.name),
    avatar_url = coalesce(public.allowed_users.avatar_url, excluded.avatar_url),
    source     = case
                   when public.allowed_users.source = 'seed' then excluded.source
                   else public.allowed_users.source
                 end;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.get_access_status(email_in text)
returns table (status access_status)
language sql
security definer
set search_path = public
as $$
  select status from public.allowed_users where email = lower(email_in);
$$;
