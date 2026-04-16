create table if not exists public.anime_event_state (
  anime_id bigint primary key references public.anime(id) on delete cascade,
  last_episode_number integer,
  last_episode_at timestamptz,
  is_completed boolean not null default false,
  completed_at timestamptz,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists anime_event_state_set_updated_at on public.anime_event_state;
create trigger anime_event_state_set_updated_at
before update on public.anime_event_state
for each row execute procedure public.set_updated_at();

create table if not exists public.anime_events (
  id bigserial primary key,
  anime_id bigint not null references public.anime(id) on delete cascade,
  event_type text not null,
  episode_number integer,
  event_occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists anime_events_episode_unique_idx
  on public.anime_events (anime_id, event_type, episode_number)
  where event_type = 'new_episode';

create unique index if not exists anime_events_completed_unique_idx
  on public.anime_events (anime_id, event_type)
  where event_type = 'anime_completed';

create index if not exists anime_events_lookup_idx
  on public.anime_events (anime_id, event_type, event_occurred_at desc);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  new_episode_enabled boolean not null default true,
  anime_completed_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_notification_preferences_set_updated_at on public.user_notification_preferences;
create trigger user_notification_preferences_set_updated_at
before update on public.user_notification_preferences
for each row execute procedure public.set_updated_at();

create table if not exists public.user_notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  anime_event_id bigint not null references public.anime_events(id) on delete cascade,
  anime_id bigint not null references public.anime(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, anime_event_id)
);

create index if not exists user_notifications_unread_idx
  on public.user_notifications (user_id, is_read, created_at desc);

create index if not exists user_notifications_created_idx
  on public.user_notifications (user_id, created_at desc);

alter table public.anime_event_state enable row level security;
alter table public.anime_events enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.user_notifications enable row level security;

drop policy if exists "user_notification_preferences_select_own" on public.user_notification_preferences;
create policy "user_notification_preferences_select_own"
on public.user_notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_notification_preferences_insert_own" on public.user_notification_preferences;
create policy "user_notification_preferences_insert_own"
on public.user_notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_notification_preferences_update_own" on public.user_notification_preferences;
create policy "user_notification_preferences_update_own"
on public.user_notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_notifications_select_own" on public.user_notifications;
create policy "user_notifications_select_own"
on public.user_notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_notifications_update_own" on public.user_notifications;
create policy "user_notifications_update_own"
on public.user_notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
