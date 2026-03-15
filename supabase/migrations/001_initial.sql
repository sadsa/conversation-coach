-- supabase/migrations/001_initial.sql

create type session_status as enum (
  'uploading', 'transcribing', 'identifying', 'analysing', 'ready', 'error'
);

create type annotation_type as enum ('grammar', 'naturalness', 'strength');

create table sessions (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  status          session_status not null default 'uploading',
  error_stage     text check (error_stage in ('uploading', 'transcribing', 'analysing')),
  duration_seconds int,
  audio_r2_key    text,
  assemblyai_job_id text,
  detected_speaker_count int,
  user_speaker_label text check (user_speaker_label in ('A', 'B')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table transcript_segments (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  speaker     text not null check (speaker in ('A', 'B')),
  text        text not null,
  start_ms    int not null,
  end_ms      int not null,
  position    int not null
);

create table annotations (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  segment_id  uuid not null references transcript_segments(id) on delete cascade,
  type        annotation_type not null,
  original    text not null,
  start_char  int not null,
  end_char    int not null,
  correction  text,
  explanation text not null
);

create table practice_items (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  annotation_id uuid references annotations(id) on delete set null,
  type          annotation_type not null,
  original      text not null,
  correction    text,
  explanation   text not null,
  reviewed      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- updated_at trigger
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger sessions_updated_at before update on sessions
  for each row execute function set_updated_at();

create trigger practice_items_updated_at before update on practice_items
  for each row execute function set_updated_at();
