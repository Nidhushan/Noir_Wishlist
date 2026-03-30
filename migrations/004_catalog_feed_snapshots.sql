create table if not exists public.catalog_feed_snapshots (
  id bigserial primary key,
  feed_type text not null,
  snapshot_date date not null,
  page integer not null default 1,
  items jsonb not null default '[]'::jsonb,
  total integer not null default 0,
  has_next_page boolean not null default false,
  last_page integer not null default 1,
  source text not null default 'anilist',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feed_type, snapshot_date, page)
);

drop trigger if exists catalog_feed_snapshots_set_updated_at on public.catalog_feed_snapshots;
create trigger catalog_feed_snapshots_set_updated_at
before update on public.catalog_feed_snapshots
for each row execute procedure public.set_updated_at();

create index if not exists catalog_feed_snapshots_lookup_idx
  on public.catalog_feed_snapshots (feed_type, snapshot_date desc, page);

alter table public.catalog_feed_snapshots enable row level security;

drop policy if exists "catalog_feed_snapshots_public_read" on public.catalog_feed_snapshots;
create policy "catalog_feed_snapshots_public_read"
on public.catalog_feed_snapshots
for select
to anon, authenticated
using (true);
