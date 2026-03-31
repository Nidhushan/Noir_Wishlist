create table if not exists public.feed_refresh_state (
  feed_type text primary key,
  last_attempted_at timestamptz,
  last_succeeded_at timestamptz,
  status text not null default 'idle',
  error_message text,
  next_allowed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists feed_refresh_state_set_updated_at on public.feed_refresh_state;
create trigger feed_refresh_state_set_updated_at
before update on public.feed_refresh_state
for each row execute procedure public.set_updated_at();

alter table public.feed_refresh_state enable row level security;
