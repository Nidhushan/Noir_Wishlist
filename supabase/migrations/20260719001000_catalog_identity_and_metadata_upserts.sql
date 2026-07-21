-- Migration 010: immutable catalog identity and metadata-safe upserts.
alter table public.anime
  add column if not exists row_version bigint not null default 1;

alter table public.anime
  drop constraint if exists anime_anilist_id_positive_check;
alter table public.anime
  add constraint anime_anilist_id_positive_check
  check (anilist_id is null or anilist_id > 0) not valid;
alter table public.anime
  validate constraint anime_anilist_id_positive_check;

alter table public.anime
  drop constraint if exists anime_metadata_tier_check;
alter table public.anime
  add constraint anime_metadata_tier_check
  check (metadata_tier in ('basic', 'detail')) not valid;
alter table public.anime
  validate constraint anime_metadata_tier_check;

update public.anime
set detail_synced_at = coalesce(last_synced_at, updated_at, now())
where metadata_tier = 'detail'
  and detail_synced_at is null;

alter table public.anime
  drop constraint if exists anime_detail_sync_check;
alter table public.anime
  add constraint anime_detail_sync_check
  check (metadata_tier <> 'detail' or detail_synced_at is not null) not valid;
alter table public.anime
  validate constraint anime_detail_sync_check;

create or replace function public.protect_anime_provider_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.anilist_id is not null
    and new.anilist_id is distinct from old.anilist_id then
    raise exception 'an assigned AniList identity cannot be changed or cleared';
  end if;

  return new;
end;
$$;

drop trigger if exists anime_protect_provider_identity on public.anime;
create trigger anime_protect_provider_identity
before update of anilist_id on public.anime
for each row execute procedure public.protect_anime_provider_identity();

create table if not exists public.anime_sources (
  id bigserial primary key,
  anime_id bigint not null references public.anime(id) on delete cascade,
  provider text not null,
  external_id text,
  source_fingerprint text,
  canonical_url text,
  confidence text not null default 'exact',
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anime_sources_provider_check check (nullif(btrim(provider), '') is not null),
  constraint anime_sources_identity_check check (
    nullif(btrim(external_id), '') is not null
    or nullif(btrim(source_fingerprint), '') is not null
  ),
  constraint anime_sources_confidence_check
    check (confidence in ('exact', 'verified', 'heuristic')),
  constraint anime_sources_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists anime_sources_provider_external_unique_idx
  on public.anime_sources (provider, external_id)
  where external_id is not null;

create unique index if not exists anime_sources_provider_fingerprint_unique_idx
  on public.anime_sources (provider, source_fingerprint)
  where source_fingerprint is not null;

create index if not exists anime_sources_anime_idx
  on public.anime_sources (anime_id, provider);

drop trigger if exists anime_sources_set_updated_at on public.anime_sources;
create trigger anime_sources_set_updated_at
before update on public.anime_sources
for each row execute procedure public.set_updated_at();

create or replace function public.protect_anime_source_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.anime_id is distinct from old.anime_id
    or new.provider is distinct from old.provider
    or new.external_id is distinct from old.external_id
    or new.source_fingerprint is distinct from old.source_fingerprint then
    raise exception 'an assigned source identity cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists anime_sources_protect_identity on public.anime_sources;
create trigger anime_sources_protect_identity
before update of anime_id, provider, external_id, source_fingerprint
on public.anime_sources
for each row execute procedure public.protect_anime_source_identity();

alter table public.anime_sources enable row level security;

insert into public.anime_sources (
  anime_id,
  provider,
  external_id,
  canonical_url,
  confidence
)
select anime.id,
       'anilist',
       anime.anilist_id::text,
       'https://anilist.co/anime/' || anime.anilist_id,
       'exact'
from public.anime anime
where anime.anilist_id is not null
on conflict do nothing;

insert into public.anime_sources (
  anime_id,
  provider,
  source_fingerprint,
  canonical_url,
  confidence
)
select anime.id,
       'anime-offline-database',
       anime.source_fingerprint,
       (
         select url
         from unnest(anime.source_urls) url
         limit 1
       ),
       'exact'
from public.anime anime
where anime.source_fingerprint is not null
on conflict do nothing;

create or replace function public.upsert_anilist_anime_batch_v1(
  p_records jsonb,
  p_metadata_tier text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  record_count integer;
  valid_count integer;
  distinct_id_count integer;
  result jsonb;
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'records must be a JSON array';
  end if;

  record_count := jsonb_array_length(p_records);

  if record_count < 1 or record_count > 500 then
    raise exception 'records must contain between 1 and 500 items';
  end if;

  if p_metadata_tier not in ('basic', 'detail') then
    raise exception 'metadata tier must be basic or detail';
  end if;

  select count(*)::integer,
         count(distinct parsed.anilist_id)::integer
  into valid_count, distinct_id_count
  from jsonb_to_recordset(p_records) as parsed(
    anilist_id integer,
    title_display text,
    title_normalized text
  )
  where parsed.anilist_id > 0
    and nullif(btrim(parsed.title_display), '') is not null
    and nullif(btrim(parsed.title_normalized), '') is not null;

  if valid_count <> record_count or distinct_id_count <> record_count then
    raise exception 'records require unique positive AniList IDs and non-empty titles';
  end if;

  with parsed as materialized (
    select input.ordinality,
           record.*
    from jsonb_array_elements(p_records) with ordinality input(value, ordinality)
    cross join lateral jsonb_to_record(input.value) as record(
      anilist_id integer,
      source_url text,
      title_display text,
      title_normalized text,
      title_english text,
      title_romaji text,
      title_native text,
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
      genres text[],
      site_url text
    )
  ),
  upserted as (
    insert into public.anime as stored (
      anilist_id,
      source_provider,
      source_urls,
      title_display,
      title_normalized,
      title_english,
      title_romaji,
      title_native,
      cover_image,
      banner_image,
      format,
      status,
      episodes,
      country_of_origin,
      season,
      season_year,
      average_score,
      popularity,
      description,
      genres,
      site_url,
      metadata_tier,
      last_synced_at,
      detail_synced_at
    )
    select parsed.anilist_id,
           'anilist',
           case
             when nullif(btrim(parsed.source_url), '') is null then '{}'::text[]
             else array[parsed.source_url]
           end,
           parsed.title_display,
           parsed.title_normalized,
           parsed.title_english,
           parsed.title_romaji,
           parsed.title_native,
           parsed.cover_image,
           parsed.banner_image,
           parsed.format,
           parsed.status,
           parsed.episodes,
           parsed.country_of_origin,
           parsed.season,
           parsed.season_year,
           parsed.average_score,
           parsed.popularity,
           case when p_metadata_tier = 'detail' then parsed.description else null end,
           case
             when p_metadata_tier = 'detail' then coalesce(parsed.genres, '{}'::text[])
             else '{}'::text[]
           end,
           case when p_metadata_tier = 'detail' then parsed.site_url else null end,
           p_metadata_tier,
           now(),
           case when p_metadata_tier = 'detail' then now() else null end
    from parsed
    on conflict (anilist_id)
    do update set
      source_provider = 'anilist',
      source_urls = array(
        select distinct source_url
        from unnest(stored.source_urls || excluded.source_urls) source_url
        where nullif(btrim(source_url), '') is not null
        order by source_url
      ),
      title_display = coalesce(nullif(btrim(excluded.title_display), ''), stored.title_display),
      title_normalized = coalesce(
        nullif(btrim(excluded.title_normalized), ''),
        stored.title_normalized
      ),
      title_english = coalesce(excluded.title_english, stored.title_english),
      title_romaji = coalesce(excluded.title_romaji, stored.title_romaji),
      title_native = coalesce(excluded.title_native, stored.title_native),
      cover_image = coalesce(excluded.cover_image, stored.cover_image),
      banner_image = coalesce(excluded.banner_image, stored.banner_image),
      format = coalesce(excluded.format, stored.format),
      status = coalesce(excluded.status, stored.status),
      episodes = coalesce(excluded.episodes, stored.episodes),
      country_of_origin = coalesce(excluded.country_of_origin, stored.country_of_origin),
      season = coalesce(excluded.season, stored.season),
      season_year = coalesce(excluded.season_year, stored.season_year),
      average_score = coalesce(excluded.average_score, stored.average_score),
      popularity = coalesce(excluded.popularity, stored.popularity),
      description = case
        when p_metadata_tier = 'detail'
          then coalesce(excluded.description, stored.description)
        else stored.description
      end,
      genres = case
        when p_metadata_tier = 'detail' and cardinality(excluded.genres) > 0
          then excluded.genres
        else stored.genres
      end,
      site_url = case
        when p_metadata_tier = 'detail'
          then coalesce(excluded.site_url, stored.site_url)
        else stored.site_url
      end,
      metadata_tier = case
        when p_metadata_tier = 'detail' then 'detail'
        else stored.metadata_tier
      end,
      last_synced_at = now(),
      detail_synced_at = case
        when p_metadata_tier = 'detail' then now()
        else stored.detail_synced_at
      end,
      row_version = stored.row_version + 1
    returning stored.*
  ),
  linked_sources as (
    insert into public.anime_sources as source (
      anime_id,
      provider,
      external_id,
      canonical_url,
      confidence,
      last_seen_at
    )
    select upserted.id,
           'anilist',
           upserted.anilist_id::text,
           'https://anilist.co/anime/' || upserted.anilist_id,
           'exact',
           now()
    from upserted
    on conflict (provider, external_id) where external_id is not null
    do update set
      anime_id = excluded.anime_id,
      canonical_url = coalesce(excluded.canonical_url, source.canonical_url),
      last_seen_at = now()
    returning anime_id
  )
  select jsonb_build_object(
    'status', 'committed',
    'records', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'anilistId', upserted.anilist_id,
            'animeId', upserted.id,
            'metadataTier', upserted.metadata_tier,
            'row', to_jsonb(upserted)
          )
          order by parsed.ordinality
        )
        from upserted
        join parsed on parsed.anilist_id = upserted.anilist_id
      ),
      '[]'::jsonb
    ),
    'sourcesLinked', (select count(*)::integer from linked_sources)
  )
  into result;

  if jsonb_array_length(result->'records') <> record_count then
    raise exception 'catalog upsert did not return every input record';
  end if;

  return result;
end;
$$;

create or replace function public.upsert_offline_anime_batch_v1(
  p_records jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  record_count integer;
  valid_count integer;
  distinct_fingerprint_count integer;
  result jsonb;
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'records must be a JSON array';
  end if;

  record_count := jsonb_array_length(p_records);

  if record_count < 1 or record_count > 500 then
    raise exception 'records must contain between 1 and 500 items';
  end if;

  select count(*)::integer,
         count(distinct parsed.source_fingerprint)::integer
  into valid_count, distinct_fingerprint_count
  from jsonb_to_recordset(p_records) as parsed(
    anilist_id integer,
    source_fingerprint text,
    title_display text,
    title_normalized text
  )
  where (parsed.anilist_id is null or parsed.anilist_id > 0)
    and nullif(btrim(parsed.source_fingerprint), '') is not null
    and nullif(btrim(parsed.title_display), '') is not null
    and nullif(btrim(parsed.title_normalized), '') is not null;

  if valid_count <> record_count or distinct_fingerprint_count <> record_count then
    raise exception 'offline records require unique fingerprints and valid titles';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_records) as duplicate(anilist_id integer)
    where duplicate.anilist_id is not null
    group by duplicate.anilist_id
    having count(*) > 1
  ) then
    raise exception 'offline records require unique non-null AniList IDs per batch';
  end if;

  with parsed as (
    select record.anilist_id,
           record.source_fingerprint
    from jsonb_array_elements(p_records) input(value)
    cross join lateral jsonb_to_record(input.value) as record(
      anilist_id integer,
      source_fingerprint text
    )
    where record.anilist_id is not null
  )
  update public.anime as stored
  set anilist_id = parsed.anilist_id,
      row_version = stored.row_version + 1
  from parsed
  where stored.anilist_id is null
    and stored.source_fingerprint = parsed.source_fingerprint
    and not exists (
      select 1
      from public.anime assigned
      where assigned.anilist_id = parsed.anilist_id
    );

  with parsed as materialized (
    select input.ordinality,
           record.*
    from jsonb_array_elements(p_records) with ordinality input(value, ordinality)
    cross join lateral jsonb_to_record(input.value) as record(
      anilist_id integer,
      source_fingerprint text,
      source_urls text[],
      title_display text,
      title_normalized text,
      synonyms text[],
      studios text[],
      tags text[],
      cover_image text,
      format text,
      status text,
      episodes integer,
      season text,
      season_year integer,
      average_score integer
    )
  ),
  with_anilist as (
    insert into public.anime as stored (
      anilist_id,
      source_provider,
      source_urls,
      title_display,
      title_normalized,
      synonyms,
      studios,
      tags,
      cover_image,
      format,
      status,
      episodes,
      season,
      season_year,
      average_score,
      metadata_tier,
      last_synced_at
    )
    select parsed.anilist_id,
           'anime-offline-database',
           coalesce(parsed.source_urls, '{}'::text[]),
           parsed.title_display,
           parsed.title_normalized,
           coalesce(parsed.synonyms, '{}'::text[]),
           coalesce(parsed.studios, '{}'::text[]),
           coalesce(parsed.tags, '{}'::text[]),
           parsed.cover_image,
           parsed.format,
           parsed.status,
           parsed.episodes,
           parsed.season,
           parsed.season_year,
           parsed.average_score,
           'basic',
           now()
    from parsed
    where parsed.anilist_id is not null
    on conflict (anilist_id)
    do update set
      source_urls = array(
        select distinct source_url
        from unnest(stored.source_urls || excluded.source_urls) source_url
        where nullif(btrim(source_url), '') is not null
        order by source_url
      ),
      cover_image = coalesce(stored.cover_image, excluded.cover_image),
      format = coalesce(stored.format, excluded.format),
      status = coalesce(stored.status, excluded.status),
      episodes = coalesce(stored.episodes, excluded.episodes),
      season = coalesce(stored.season, excluded.season),
      season_year = coalesce(stored.season_year, excluded.season_year),
      average_score = coalesce(stored.average_score, excluded.average_score),
      synonyms = case
        when cardinality(stored.synonyms) = 0 then excluded.synonyms
        else stored.synonyms
      end,
      studios = case
        when cardinality(stored.studios) = 0 then excluded.studios
        else stored.studios
      end,
      tags = case
        when cardinality(stored.tags) = 0 then excluded.tags
        else stored.tags
      end,
      last_synced_at = greatest(stored.last_synced_at, now()),
      row_version = stored.row_version + 1
    returning stored.*
  ),
  without_anilist as (
    insert into public.anime as stored (
      anilist_id,
      source_fingerprint,
      source_provider,
      source_urls,
      title_display,
      title_normalized,
      synonyms,
      studios,
      tags,
      cover_image,
      format,
      status,
      episodes,
      season,
      season_year,
      average_score,
      metadata_tier,
      last_synced_at
    )
    select null,
           parsed.source_fingerprint,
           'anime-offline-database',
           coalesce(parsed.source_urls, '{}'::text[]),
           parsed.title_display,
           parsed.title_normalized,
           coalesce(parsed.synonyms, '{}'::text[]),
           coalesce(parsed.studios, '{}'::text[]),
           coalesce(parsed.tags, '{}'::text[]),
           parsed.cover_image,
           parsed.format,
           parsed.status,
           parsed.episodes,
           parsed.season,
           parsed.season_year,
           parsed.average_score,
           'basic',
           now()
    from parsed
    where parsed.anilist_id is null
    on conflict (source_fingerprint)
    do update set
      source_urls = array(
        select distinct source_url
        from unnest(stored.source_urls || excluded.source_urls) source_url
        where nullif(btrim(source_url), '') is not null
        order by source_url
      ),
      title_display = coalesce(nullif(btrim(excluded.title_display), ''), stored.title_display),
      title_normalized = coalesce(
        nullif(btrim(excluded.title_normalized), ''),
        stored.title_normalized
      ),
      synonyms = excluded.synonyms,
      studios = excluded.studios,
      tags = excluded.tags,
      cover_image = coalesce(excluded.cover_image, stored.cover_image),
      format = coalesce(excluded.format, stored.format),
      status = coalesce(excluded.status, stored.status),
      episodes = coalesce(excluded.episodes, stored.episodes),
      season = coalesce(excluded.season, stored.season),
      season_year = coalesce(excluded.season_year, stored.season_year),
      average_score = coalesce(excluded.average_score, stored.average_score),
      last_synced_at = now(),
      row_version = stored.row_version + 1
    returning stored.*
  ),
  upserted as (
    select * from with_anilist
    union all
    select * from without_anilist
  ),
  offline_sources as (
    insert into public.anime_sources as source (
      anime_id,
      provider,
      source_fingerprint,
      canonical_url,
      confidence,
      last_seen_at
    )
    select upserted.id,
           'anime-offline-database',
           parsed.source_fingerprint,
           parsed.source_urls[1],
           'exact',
           now()
    from upserted
    join parsed on parsed.anilist_id is not distinct from upserted.anilist_id
      and (
        parsed.anilist_id is not null
        or parsed.source_fingerprint = upserted.source_fingerprint
      )
    on conflict (provider, source_fingerprint) where source_fingerprint is not null
    do update set
      anime_id = excluded.anime_id,
      canonical_url = coalesce(source.canonical_url, excluded.canonical_url),
      last_seen_at = now()
    returning anime_id
  ),
  anilist_sources as (
    insert into public.anime_sources as source (
      anime_id,
      provider,
      external_id,
      canonical_url,
      confidence,
      last_seen_at
    )
    select upserted.id,
           'anilist',
           upserted.anilist_id::text,
           'https://anilist.co/anime/' || upserted.anilist_id,
           'exact',
           now()
    from upserted
    where upserted.anilist_id is not null
    on conflict (provider, external_id) where external_id is not null
    do update set
      anime_id = excluded.anime_id,
      last_seen_at = now()
    returning anime_id
  )
  select jsonb_build_object(
    'status', 'committed',
    'records', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'anilistId', upserted.anilist_id,
            'animeId', upserted.id,
            'metadataTier', upserted.metadata_tier,
            'row', to_jsonb(upserted)
          )
          order by parsed.ordinality
        )
        from upserted
        join parsed on parsed.anilist_id is not distinct from upserted.anilist_id
          and (
            parsed.anilist_id is not null
            or parsed.source_fingerprint = upserted.source_fingerprint
          )
      ),
      '[]'::jsonb
    ),
    'sourcesLinked',
      (select count(*)::integer from offline_sources) +
      (select count(*)::integer from anilist_sources)
  )
  into result;

  if jsonb_array_length(result->'records') <> record_count then
    raise exception 'offline catalog upsert did not return every input record';
  end if;

  return result;
end;
$$;

revoke all on table public.anime_sources from public, anon, authenticated;
grant select, insert, update, delete on table public.anime_sources to service_role;
grant usage, select on sequence public.anime_sources_id_seq to service_role;

revoke all on function public.protect_anime_provider_identity()
  from public, anon, authenticated;
revoke all on function public.protect_anime_source_identity()
  from public, anon, authenticated;

revoke all on function public.upsert_anilist_anime_batch_v1(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.upsert_anilist_anime_batch_v1(jsonb, text)
  to service_role;

revoke all on function public.upsert_offline_anime_batch_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_offline_anime_batch_v1(jsonb)
  to service_role;
