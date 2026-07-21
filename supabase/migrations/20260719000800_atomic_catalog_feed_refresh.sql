-- Migration 008: atomic catalog feed refresh.
alter table public.catalog_feed_snapshots
  add column if not exists item_count integer;

update public.catalog_feed_snapshots snapshot
set item_count = (
  select count(*)::integer
  from public.catalog_feed_items item
  where item.feed_type = snapshot.feed_type
    and item.snapshot_date = snapshot.snapshot_date
    and item.page = snapshot.page
)
where snapshot.item_count is null;

alter table public.catalog_feed_snapshots
  alter column item_count set default 0,
  alter column item_count set not null;

alter table public.catalog_feed_snapshots
  drop constraint if exists catalog_feed_snapshots_page_check;
alter table public.catalog_feed_snapshots
  add constraint catalog_feed_snapshots_page_check check (page > 0);

alter table public.catalog_feed_snapshots
  drop constraint if exists catalog_feed_snapshots_total_check;
alter table public.catalog_feed_snapshots
  add constraint catalog_feed_snapshots_total_check check (total >= 0);

alter table public.catalog_feed_snapshots
  drop constraint if exists catalog_feed_snapshots_last_page_check;
alter table public.catalog_feed_snapshots
  add constraint catalog_feed_snapshots_last_page_check check (last_page > 0);

alter table public.catalog_feed_snapshots
  drop constraint if exists catalog_feed_snapshots_item_count_check;
alter table public.catalog_feed_snapshots
  add constraint catalog_feed_snapshots_item_count_check check (item_count >= 0);

create index if not exists catalog_feed_snapshots_feed_page_date_idx
  on public.catalog_feed_snapshots (feed_type, page, snapshot_date desc);

do $$
begin
  if exists (
    select 1
    from public.catalog_feed_items item
    left join public.catalog_feed_snapshots snapshot
      on snapshot.feed_type = item.feed_type
      and snapshot.snapshot_date = item.snapshot_date
      and snapshot.page = item.page
    where snapshot.id is null
  ) then
    raise exception 'catalog_feed_items contains rows without a matching snapshot';
  end if;
end $$;

alter table public.catalog_feed_items
  drop constraint if exists catalog_feed_items_snapshot_fk;
alter table public.catalog_feed_items
  add constraint catalog_feed_items_snapshot_fk
  foreign key (feed_type, snapshot_date, page)
  references public.catalog_feed_snapshots (feed_type, snapshot_date, page)
  on delete cascade
  not valid;
alter table public.catalog_feed_items
  validate constraint catalog_feed_items_snapshot_fk;

create table if not exists public.catalog_feed_refresh_state (
  feed_type text not null,
  page integer not null,
  status text not null default 'idle',
  lease_token uuid,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  last_attempted_at timestamptz,
  last_succeeded_at timestamptz,
  failure_count integer not null default 0,
  next_allowed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (feed_type, page),
  constraint catalog_feed_refresh_state_page_check check (page > 0),
  constraint catalog_feed_refresh_state_failure_count_check check (failure_count >= 0),
  constraint catalog_feed_refresh_state_status_check
    check (status in ('idle', 'refreshing', 'success', 'failed'))
);

drop trigger if exists catalog_feed_refresh_state_set_updated_at
  on public.catalog_feed_refresh_state;
create trigger catalog_feed_refresh_state_set_updated_at
before update on public.catalog_feed_refresh_state
for each row execute procedure public.set_updated_at();

alter table public.catalog_feed_refresh_state enable row level security;

create or replace function public.try_acquire_catalog_feed_lease(
  p_feed_type text,
  p_page integer,
  p_lease_token uuid,
  p_lease_seconds integer default 180
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  state_row public.catalog_feed_refresh_state%rowtype;
  v_now timestamptz := now();
  expires_at timestamptz;
begin
  if nullif(btrim(p_feed_type), '') is null then
    raise exception 'feed_type is required';
  end if;

  if p_page is null or p_page <= 0 then
    raise exception 'page must be a positive integer';
  end if;

  if p_lease_token is null then
    raise exception 'lease_token is required';
  end if;

  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 600 then
    raise exception 'lease_seconds must be between 30 and 600';
  end if;

  insert into public.catalog_feed_refresh_state (feed_type, page)
  values (p_feed_type, p_page)
  on conflict (feed_type, page) do nothing;

  select *
  into state_row
  from public.catalog_feed_refresh_state
  where feed_type = p_feed_type
    and page = p_page
  for update;

  if state_row.status = 'refreshing'
    and state_row.lease_expires_at is not null
    and state_row.lease_expires_at > v_now then
    return jsonb_build_object(
      'status', 'busy',
      'expiresAt', state_row.lease_expires_at
    );
  end if;

  if state_row.next_allowed_at is not null
    and state_row.next_allowed_at > v_now then
    return jsonb_build_object(
      'status', 'cooldown',
      'nextAllowedAt', state_row.next_allowed_at
    );
  end if;

  expires_at := v_now + make_interval(secs => p_lease_seconds);

  update public.catalog_feed_refresh_state
  set status = 'refreshing',
      lease_token = p_lease_token,
      lease_acquired_at = v_now,
      lease_expires_at = expires_at,
      last_attempted_at = v_now,
      next_allowed_at = null,
      last_error_code = null,
      last_error_message = null
  where feed_type = p_feed_type
    and page = p_page;

  return jsonb_build_object(
    'status', 'acquired',
    'token', p_lease_token,
    'expiresAt', expires_at
  );
end;
$$;

create or replace function public.fail_catalog_feed_refresh(
  p_feed_type text,
  p_page integer,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected_rows integer;
begin
  update public.catalog_feed_refresh_state
  set status = 'failed',
      failure_count = failure_count + 1,
      next_allowed_at = now() + make_interval(
        secs => least(
          900,
          60 * power(2, least(failure_count, 4))::integer
        )
      ),
      last_error_code = left(coalesce(p_error_code, 'unknown'), 100),
      last_error_message = left(coalesce(p_error_message, 'Feed refresh failed.'), 500),
      lease_token = null,
      lease_acquired_at = null,
      lease_expires_at = null
  where feed_type = p_feed_type
    and page = p_page
    and lease_token = p_lease_token;

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create or replace function public.commit_catalog_feed_refresh(
  p_feed_type text,
  p_page integer,
  p_snapshot_date date,
  p_total integer,
  p_has_next_page boolean,
  p_last_page integer,
  p_lease_token uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  state_row public.catalog_feed_refresh_state%rowtype;
  expected_count integer;
  distinct_position_count integer;
  distinct_anilist_count integer;
  resolved_count integer;
  inserted_count integer;
  minimum_position integer;
  maximum_position integer;
begin
  if nullif(btrim(p_feed_type), '') is null then
    raise exception 'feed_type is required';
  end if;

  if p_page is null or p_page <= 0 then
    raise exception 'page must be a positive integer';
  end if;

  if p_snapshot_date is null then
    raise exception 'snapshot_date is required';
  end if;

  if p_total is null or p_total < 0 then
    raise exception 'total must be non-negative';
  end if;

  if p_last_page is null or p_last_page <= 0 then
    raise exception 'last_page must be positive';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  select *
  into state_row
  from public.catalog_feed_refresh_state
  where feed_type = p_feed_type
    and page = p_page
  for update;

  if not found or state_row.lease_token is distinct from p_lease_token then
    raise exception 'feed refresh lease is not owned by this worker';
  end if;

  expected_count := jsonb_array_length(p_items);

  select count(*)::integer,
         count(distinct parsed.position)::integer,
         count(distinct parsed.anilist_id)::integer,
         min(parsed.position),
         max(parsed.position)
  into expected_count,
       distinct_position_count,
       distinct_anilist_count,
       minimum_position,
       maximum_position
  from jsonb_to_recordset(p_items)
    as parsed(position integer, anilist_id integer)
  where parsed.position is not null
    and parsed.position > 0
    and parsed.anilist_id is not null
    and parsed.anilist_id > 0;

  if expected_count <> jsonb_array_length(p_items) then
    raise exception 'every item requires a positive position and AniList ID';
  end if;

  if expected_count > 0 and (
    distinct_position_count <> expected_count
    or distinct_anilist_count <> expected_count
    or minimum_position <> 1
    or maximum_position <> expected_count
  ) then
    raise exception 'item positions and AniList IDs must be unique and contiguous';
  end if;

  select count(*)::integer
  into resolved_count
  from jsonb_to_recordset(p_items)
    as parsed(position integer, anilist_id integer)
  join public.anime anime on anime.anilist_id = parsed.anilist_id;

  if resolved_count <> expected_count then
    raise exception 'one or more feed anime are missing from the catalog';
  end if;

  insert into public.catalog_feed_snapshots (
    feed_type,
    snapshot_date,
    page,
    items,
    total,
    has_next_page,
    last_page,
    item_count,
    source
  )
  values (
    p_feed_type,
    p_snapshot_date,
    p_page,
    '[]'::jsonb,
    p_total,
    p_has_next_page,
    p_last_page,
    expected_count,
    'anilist'
  )
  on conflict (feed_type, snapshot_date, page)
  do update set
    total = excluded.total,
    has_next_page = excluded.has_next_page,
    last_page = excluded.last_page,
    item_count = excluded.item_count,
    source = excluded.source;

  delete from public.catalog_feed_items
  where feed_type = p_feed_type
    and snapshot_date = p_snapshot_date
    and page = p_page;

  insert into public.catalog_feed_items (
    feed_type,
    snapshot_date,
    page,
    position,
    anime_id
  )
  select p_feed_type,
         p_snapshot_date,
         p_page,
         parsed.position,
         anime.id
  from jsonb_to_recordset(p_items)
    as parsed(position integer, anilist_id integer)
  join public.anime anime on anime.anilist_id = parsed.anilist_id
  order by parsed.position;

  get diagnostics inserted_count = row_count;

  if inserted_count <> expected_count then
    raise exception 'feed item insertion count did not match the expected count';
  end if;

  update public.catalog_feed_refresh_state
  set status = 'success',
      last_succeeded_at = now(),
      failure_count = 0,
      next_allowed_at = null,
      last_error_code = null,
      last_error_message = null,
      lease_token = null,
      lease_acquired_at = null,
      lease_expires_at = null
  where feed_type = p_feed_type
    and page = p_page
    and lease_token = p_lease_token;

  if not found then
    raise exception 'feed refresh lease was lost before commit';
  end if;

  return jsonb_build_object(
    'status', 'committed',
    'feedType', p_feed_type,
    'page', p_page,
    'snapshotDate', p_snapshot_date,
    'itemCount', expected_count
  );
end;
$$;

create or replace function public.read_catalog_feed_candidates(
  p_feed_type text,
  p_page integer,
  p_limit integer default 5
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(candidate.payload order by candidate.snapshot_date desc), '[]'::jsonb)
  from (
    select snapshot.snapshot_date,
           jsonb_build_object(
             'snapshotDate', snapshot.snapshot_date,
             'updatedAt', snapshot.updated_at,
             'page', snapshot.page,
             'hasNextPage', snapshot.has_next_page,
             'lastPage', snapshot.last_page,
             'total', snapshot.total,
             'itemCount', snapshot.item_count,
             'items', coalesce(
               (
                 select jsonb_agg(
                   jsonb_build_object(
                     'anilistId', anime.anilist_id,
                     'title', anime.title_display,
                     'titleEnglish', anime.title_english,
                     'titleRomaji', anime.title_romaji,
                     'titleNative', anime.title_native,
                     'coverImage', anime.cover_image,
                     'bannerImage', anime.banner_image,
                     'format', anime.format,
                     'status', anime.status,
                     'episodes', anime.episodes,
                     'countryOfOrigin', anime.country_of_origin,
                     'season', anime.season,
                     'seasonYear', anime.season_year,
                     'averageScore', anime.average_score,
                     'popularity', anime.popularity
                   )
                   order by item.position
                 )
                 from public.catalog_feed_items item
                 join public.anime anime on anime.id = item.anime_id
                 where item.feed_type = snapshot.feed_type
                   and item.snapshot_date = snapshot.snapshot_date
                   and item.page = snapshot.page
               ),
               '[]'::jsonb
             )
           ) as payload
    from public.catalog_feed_snapshots snapshot
    where snapshot.feed_type = p_feed_type
      and snapshot.page = p_page
    order by snapshot.snapshot_date desc
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  ) candidate;
$$;

revoke all on function public.try_acquire_catalog_feed_lease(text, integer, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.fail_catalog_feed_refresh(text, integer, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.commit_catalog_feed_refresh(
  text, integer, date, integer, boolean, integer, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.try_acquire_catalog_feed_lease(text, integer, uuid, integer)
  to service_role;
grant execute on function public.fail_catalog_feed_refresh(text, integer, uuid, text, text)
  to service_role;
grant execute on function public.commit_catalog_feed_refresh(
  text, integer, date, integer, boolean, integer, uuid, jsonb
) to service_role;

revoke all on function public.read_catalog_feed_candidates(text, integer, integer)
  from public;
grant execute on function public.read_catalog_feed_candidates(text, integer, integer)
  to anon, authenticated, service_role;
