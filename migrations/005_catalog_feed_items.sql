create table if not exists public.catalog_feed_items (
  id bigserial primary key,
  feed_type text not null,
  snapshot_date date not null,
  page integer not null default 1,
  position integer not null,
  anime_id bigint not null references public.anime(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (feed_type, snapshot_date, page, position),
  unique (feed_type, snapshot_date, page, anime_id)
);

create index if not exists catalog_feed_items_lookup_idx
  on public.catalog_feed_items (feed_type, snapshot_date desc, page, position);

create index if not exists catalog_feed_items_anime_idx
  on public.catalog_feed_items (anime_id);

alter table public.catalog_feed_items enable row level security;

drop policy if exists "catalog_feed_items_public_read" on public.catalog_feed_items;
create policy "catalog_feed_items_public_read"
on public.catalog_feed_items
for select
to anon, authenticated
using (true);
