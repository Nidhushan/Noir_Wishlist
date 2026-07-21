-- Migration 011: traffic-independent notification collection for tracked anime.
alter table public.notification_observations
  drop constraint if exists notification_observations_source_feed_check;
alter table public.notification_observations
  add constraint notification_observations_source_feed_check
  check (
    (observation_type = 'new_episode' and source_feed in ('new-episodes', 'tracked-anime'))
    or (
      observation_type = 'anime_completed'
      and source_feed in ('recently-completed', 'tracked-anime')
    )
  ) not valid;
alter table public.notification_observations
  validate constraint notification_observations_source_feed_check;

create or replace function public.list_notification_tracking_targets_v1(
  p_after_anime_id bigint default 0,
  p_limit integer default 100
)
returns table(anime_id bigint, anilist_id integer)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select anime.id,
         anime.anilist_id
  from public.anime anime
  where anime.id > coalesce(p_after_anime_id, 0)
    and anime.anilist_id is not null
    and exists (
      select 1
      from public.user_anime library
      where library.anime_id = anime.id
        and library.list_status in ('watching', 'wishlist')
    )
  order by anime.id
  limit case
    when p_limit between 1 and 500 then p_limit
    else 100
  end;
$$;

create or replace function public.enqueue_notification_observation_batch_v1(
  p_observations jsonb,
  p_source_run_id bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  observation_count integer;
  valid_count integer;
  distinct_count integer;
  queued_count integer;
begin
  if p_observations is null or jsonb_typeof(p_observations) <> 'array' then
    raise exception 'observations must be a JSON array';
  end if;

  observation_count := jsonb_array_length(p_observations);

  if observation_count < 1 or observation_count > 500 then
    raise exception 'observations must contain between 1 and 500 items';
  end if;

  if p_source_run_id is not null and not exists (
    select 1
    from public.sync_runs run
    where run.id = p_source_run_id
      and run.job_type = 'notification_collection'
  ) then
    raise exception 'source run is not a notification collection run';
  end if;

  select count(*)::integer,
         count(distinct concat_ws(
           ':',
           parsed.observation_type,
           parsed.anilist_id::text,
           coalesce(parsed.episode_number::text, 'completed')
         ))::integer
  into valid_count, distinct_count
  from jsonb_to_recordset(p_observations) as parsed(
    observation_type text,
    anilist_id integer,
    episode_number integer,
    event_occurred_at timestamptz,
    payload jsonb
  )
  where parsed.anilist_id > 0
    and parsed.event_occurred_at is not null
    and coalesce(jsonb_typeof(parsed.payload), 'object') = 'object'
    and (
      (
        parsed.observation_type = 'new_episode'
        and parsed.episode_number is not null
        and parsed.episode_number > 0
      )
      or (
        parsed.observation_type = 'anime_completed'
        and parsed.episode_number is null
      )
    )
    and exists (
      select 1
      from public.anime anime
      where anime.anilist_id = parsed.anilist_id
    );

  if valid_count <> observation_count or distinct_count <> observation_count then
    raise exception 'observations must be unique and reference stored AniList anime';
  end if;

  insert into public.notification_observations (
    anime_id,
    observation_type,
    episode_number,
    event_occurred_at,
    source_feed,
    source_snapshot_date,
    source_page,
    payload
  )
  select anime.id,
         parsed.observation_type,
         parsed.episode_number,
         parsed.event_occurred_at,
         'tracked-anime',
         current_date,
         1,
         coalesce(parsed.payload, '{}'::jsonb) || case
           when p_source_run_id is null then '{}'::jsonb
           else jsonb_build_object('sourceRunId', p_source_run_id)
         end
  from jsonb_to_recordset(p_observations) as parsed(
    observation_type text,
    anilist_id integer,
    episode_number integer,
    event_occurred_at timestamptz,
    payload jsonb
  )
  join public.anime anime on anime.anilist_id = parsed.anilist_id
  on conflict do nothing;

  get diagnostics queued_count = row_count;

  return jsonb_build_object(
    'status', 'accepted',
    'observationsAccepted', observation_count,
    'observationsQueued', queued_count
  );
end;
$$;

revoke all on function public.list_notification_tracking_targets_v1(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.list_notification_tracking_targets_v1(bigint, integer)
  to service_role;

revoke all on function public.enqueue_notification_observation_batch_v1(jsonb, bigint)
  from public, anon, authenticated;
grant execute on function public.enqueue_notification_observation_batch_v1(jsonb, bigint)
  to service_role;
