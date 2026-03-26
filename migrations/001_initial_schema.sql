create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anime (
  id bigserial primary key,
  anilist_id integer unique,
  source_fingerprint text unique,
  source_provider text,
  source_urls text[] not null default '{}'::text[],
  title_display text not null,
  title_normalized text not null,
  title_english text,
  title_romaji text,
  title_native text,
  synonyms text[] not null default '{}'::text[],
  studios text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  cover_image text,
  banner_image text,
  format text,
  status text,
  episodes integer,
  country_of_origin text,
  season text,
  season_year integer,
  average_score integer,
  popularity integer,
  description text,
  genres text[] not null default '{}'::text[],
  site_url text,
  metadata_tier text not null default 'basic',
  last_synced_at timestamptz not null default now(),
  detail_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_anime (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  anime_id bigint not null references public.anime(id) on delete cascade,
  list_status text not null,
  progress integer not null default 0,
  score integer,
  notes text,
  priority smallint,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, anime_id)
);

create table if not exists public.sync_runs (
  id bigserial primary key,
  job_type text not null,
  status text not null,
  scope jsonb not null default '{}'::jsonb,
  processed_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists anime_set_updated_at on public.anime;
create trigger anime_set_updated_at
before update on public.anime
for each row execute procedure public.set_updated_at();

drop trigger if exists user_anime_set_updated_at on public.user_anime;
create trigger user_anime_set_updated_at
before update on public.user_anime
for each row execute procedure public.set_updated_at();

create index if not exists anime_title_normalized_idx
  on public.anime (title_normalized);

create index if not exists anime_anilist_id_idx
  on public.anime (anilist_id);

create index if not exists anime_last_synced_idx
  on public.anime (last_synced_at desc);

create index if not exists anime_popularity_idx
  on public.anime (popularity desc);

create index if not exists user_anime_user_status_updated_idx
  on public.user_anime (user_id, list_status, updated_at desc);

create index if not exists user_anime_user_added_idx
  on public.user_anime (user_id, added_at desc);

alter table public.profiles enable row level security;
alter table public.anime enable row level security;
alter table public.user_anime enable row level security;
alter table public.sync_runs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "anime_public_read" on public.anime;
create policy "anime_public_read"
on public.anime
for select
to anon, authenticated
using (true);

drop policy if exists "user_anime_select_own" on public.user_anime;
create policy "user_anime_select_own"
on public.user_anime
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_anime_insert_own" on public.user_anime;
create policy "user_anime_insert_own"
on public.user_anime
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_anime_update_own" on public.user_anime;
create policy "user_anime_update_own"
on public.user_anime
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_anime_delete_own" on public.user_anime;
create policy "user_anime_delete_own"
on public.user_anime
for delete
to authenticated
using (auth.uid() = user_id);
