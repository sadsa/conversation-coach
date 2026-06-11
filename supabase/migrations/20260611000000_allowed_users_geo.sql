alter table public.allowed_users
  add column if not exists ip_address text,
  add column if not exists geo_country text,
  add column if not exists geo_city    text;
