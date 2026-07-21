-- Migration 009: durable notification observation pipeline.
alter table public.anime_events
  drop constraint if exists anime_events_type_check;
alter table public.anime_events
  add constraint anime_events_type_check
  check (event_type in ('new_episode', 'anime_completed')) not valid;
alter table public.anime_events
  validate constraint anime_events_type_check;

alter table public.anime_events
  drop constraint if exists anime_events_episode_shape_check;
alter table public.anime_events
  add constraint anime_events_episode_shape_check
  check (
    (event_type = 'new_episode' and episode_number is not null and episode_number > 0)
    or (event_type = 'anime_completed' and episode_number is null)
  ) not valid;
alter table public.anime_events
  validate constraint anime_events_episode_shape_check;

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;
alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in ('new_episode', 'anime_completed')) not valid;
alter table public.user_notifications
  validate constraint user_notifications_type_check;

alter table public.anime_event_state
  add column if not exists episode_initialized boolean not null default false,
  add column if not exists completion_initialized boolean not null default false;

update public.anime_event_state
set episode_initialized = last_episode_number is not null,
    completion_initialized = last_episode_number is not null or is_completed;

alter table public.anime_event_state
  drop constraint if exists anime_event_state_episode_check;
alter table public.anime_event_state
  add constraint anime_event_state_episode_check
  check (last_episode_number is null or last_episode_number > 0) not valid;
alter table public.anime_event_state
  validate constraint anime_event_state_episode_check;

create table if not exists public.notification_observations (
  id bigserial primary key,
  anime_id bigint not null references public.anime(id) on delete cascade,
  observation_type text not null,
  episode_number integer,
  event_occurred_at timestamptz not null,
  source_feed text not null,
  source_snapshot_date date not null,
  source_page integer not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_observations_type_check
    check (observation_type in ('new_episode', 'anime_completed')),
  constraint notification_observations_episode_shape_check
    check (
      (observation_type = 'new_episode' and episode_number is not null and episode_number > 0)
      or (observation_type = 'anime_completed' and episode_number is null)
    ),
  constraint notification_observations_source_feed_check
    check (
      (observation_type = 'new_episode' and source_feed = 'new-episodes')
      or (observation_type = 'anime_completed' and source_feed = 'recently-completed')
    ),
  constraint notification_observations_source_page_check check (source_page > 0),
  constraint notification_observations_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint notification_observations_status_check
    check (status in ('pending', 'retry', 'completed', 'dead_letter')),
  constraint notification_observations_attempt_count_check check (attempt_count >= 0),
  constraint notification_observations_completion_shape_check
    check (status <> 'completed' or processed_at is not null)
);

create unique index if not exists notification_observations_episode_unique_idx
  on public.notification_observations (anime_id, observation_type, episode_number)
  where observation_type = 'new_episode';

create unique index if not exists notification_observations_completed_unique_idx
  on public.notification_observations (anime_id, observation_type)
  where observation_type = 'anime_completed';

create index if not exists notification_observations_pending_idx
  on public.notification_observations (available_at, created_at, id)
  where status in ('pending', 'retry');

create index if not exists notification_observations_anime_idx
  on public.notification_observations (anime_id, created_at, id);

drop trigger if exists notification_observations_set_updated_at
  on public.notification_observations;
create trigger notification_observations_set_updated_at
before update on public.notification_observations
for each row execute procedure public.set_updated_at();

alter table public.notification_observations enable row level security;

create or replace function public.commit_catalog_feed_refresh_v2(
  p_feed_type text,
  p_page integer,
  p_snapshot_date date,
  p_total integer,
  p_has_next_page boolean,
  p_last_page integer,
  p_lease_token uuid,
  p_items jsonb,
  p_observations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  commit_result jsonb;
  observation_count integer;
  valid_observation_count integer;
  queued_count integer;
begin
  if p_observations is null or jsonb_typeof(p_observations) <> 'array' then
    raise exception 'observations must be a JSON array';
  end if;

  observation_count := jsonb_array_length(p_observations);

  if p_feed_type not in ('new-episodes', 'recently-completed')
    and observation_count > 0 then
    raise exception 'this feed type does not support notification observations';
  end if;

  select count(*)::integer
  into valid_observation_count
  from jsonb_to_recordset(p_observations) as observation(
    observation_type text,
    anilist_id integer,
    episode_number integer,
    event_occurred_at timestamptz,
    payload jsonb
  )
  where observation.anilist_id is not null
    and observation.anilist_id > 0
    and observation.event_occurred_at is not null
    and (
      (
        p_feed_type = 'new-episodes'
        and observation.observation_type = 'new_episode'
        and observation.episode_number is not null
        and observation.episode_number > 0
      )
      or (
        p_feed_type = 'recently-completed'
        and observation.observation_type = 'anime_completed'
        and observation.episode_number is null
      )
    )
    and exists (
      select 1
      from jsonb_to_recordset(p_items) as item(position integer, anilist_id integer)
      where item.anilist_id = observation.anilist_id
    );

  if valid_observation_count <> observation_count then
    raise exception 'one or more notification observations are invalid or do not match feed items';
  end if;

  commit_result := public.commit_catalog_feed_refresh(
    p_feed_type,
    p_page,
    p_snapshot_date,
    p_total,
    p_has_next_page,
    p_last_page,
    p_lease_token,
    p_items
  );

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
         observation.observation_type,
         observation.episode_number,
         observation.event_occurred_at,
         p_feed_type,
         p_snapshot_date,
         p_page,
         coalesce(observation.payload, '{}'::jsonb)
  from jsonb_to_recordset(p_observations) as observation(
    observation_type text,
    anilist_id integer,
    episode_number integer,
    event_occurred_at timestamptz,
    payload jsonb
  )
  join public.anime anime on anime.anilist_id = observation.anilist_id
  on conflict do nothing;

  get diagnostics queued_count = row_count;

  return commit_result || jsonb_build_object(
    'observationsAccepted', observation_count,
    'observationsQueued', queued_count
  );
end;
$$;

create or replace function public.process_notification_observation_batch(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  observation_row public.notification_observations%rowtype;
  state_row public.anime_event_state%rowtype;
  anime_row public.anime%rowtype;
  event_id bigint;
  error_message text;
  error_state text;
  processed_count integer := 0;
  baseline_count integer := 0;
  ignored_count integer := 0;
  event_count integer := 0;
  notification_count integer := 0;
  retry_count integer := 0;
  dead_letter_count integer := 0;
  inserted_notifications integer := 0;
  remaining_count integer := 0;
  row_outcome text;
  row_event_created boolean;
  row_notification_count integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'limit must be between 1 and 200';
  end if;

  if not pg_try_advisory_xact_lock(71842, 90417) then
    return jsonb_build_object(
      'status', 'busy',
      'processed', 0,
      'baselined', 0,
      'ignored', 0,
      'eventsCreated', 0,
      'notificationsCreated', 0,
      'retried', 0,
      'deadLettered', 0,
      'remaining', (
        select count(*)::integer
        from public.notification_observations
        where status in ('pending', 'retry')
          and available_at <= now()
      )
    );
  end if;

  for observation_row in
    select observation.*
    from public.notification_observations observation
    where observation.status in ('pending', 'retry')
      and observation.available_at <= now()
      and not exists (
        select 1
        from public.notification_observations earlier
        where earlier.anime_id = observation.anime_id
          and earlier.status in ('pending', 'retry')
          and (earlier.created_at, earlier.id) <
            (observation.created_at, observation.id)
      )
    order by observation.created_at, observation.id
    for update skip locked
    limit p_limit
  loop
    begin
      event_id := null;
      row_outcome := null;
      row_event_created := false;
      row_notification_count := 0;

      select *
      into anime_row
      from public.anime
      where id = observation_row.anime_id;

      if not found then
        raise exception 'observation anime no longer exists';
      end if;

      insert into public.anime_event_state (anime_id)
      values (observation_row.anime_id)
      on conflict (anime_id) do nothing;

      select *
      into state_row
      from public.anime_event_state
      where anime_id = observation_row.anime_id
      for update;

      if observation_row.observation_type = 'new_episode' then
        if not state_row.episode_initialized then
          update public.anime_event_state
          set last_episode_number = observation_row.episode_number,
              last_episode_at = observation_row.event_occurred_at,
              episode_initialized = true,
              completion_initialized = true,
              last_checked_at = now()
          where anime_id = observation_row.anime_id;
          row_outcome := 'baseline';
        elsif observation_row.episode_number <= state_row.last_episode_number then
          update public.anime_event_state
          set last_checked_at = now()
          where anime_id = observation_row.anime_id;
          row_outcome := 'ignored';
        else
          insert into public.anime_events (
            anime_id,
            event_type,
            episode_number,
            event_occurred_at,
            payload
          ) values (
            observation_row.anime_id,
            'new_episode',
            observation_row.episode_number,
            observation_row.event_occurred_at,
            observation_row.payload
          )
          on conflict do nothing
          returning id into event_id;

          if event_id is null then
            select id
            into event_id
            from public.anime_events
            where anime_id = observation_row.anime_id
              and event_type = 'new_episode'
              and episode_number = observation_row.episode_number;
          else
            row_event_created := true;
          end if;

          insert into public.user_notifications (
            user_id,
            anime_event_id,
            anime_id,
            type,
            title,
            message
          )
          select distinct library.user_id,
                 event_id,
                 observation_row.anime_id,
                 'new_episode',
                 'New episode available',
                 anime_row.title_display || ' episode ' || observation_row.episode_number ||
                   ' is available now.'
          from public.user_anime library
          left join public.user_notification_preferences preferences
            on preferences.user_id = library.user_id
          where library.anime_id = observation_row.anime_id
            and library.list_status in ('watching', 'wishlist')
            and coalesce(preferences.new_episode_enabled, true)
          on conflict (user_id, anime_event_id) do nothing;

          get diagnostics inserted_notifications = row_count;
          row_notification_count := inserted_notifications;

          update public.anime_event_state
          set last_episode_number = observation_row.episode_number,
              last_episode_at = observation_row.event_occurred_at,
              episode_initialized = true,
              completion_initialized = true,
              last_checked_at = now()
          where anime_id = observation_row.anime_id;
        end if;
      elsif observation_row.observation_type = 'anime_completed' then
        if not state_row.completion_initialized then
          update public.anime_event_state
          set is_completed = true,
              completion_initialized = true,
              completed_at = observation_row.event_occurred_at,
              last_checked_at = now()
          where anime_id = observation_row.anime_id;
          row_outcome := 'baseline';
        elsif state_row.is_completed then
          update public.anime_event_state
          set last_checked_at = now()
          where anime_id = observation_row.anime_id;
          row_outcome := 'ignored';
        else
          insert into public.anime_events (
            anime_id,
            event_type,
            episode_number,
            event_occurred_at,
            payload
          ) values (
            observation_row.anime_id,
            'anime_completed',
            null,
            observation_row.event_occurred_at,
            observation_row.payload
          )
          on conflict do nothing
          returning id into event_id;

          if event_id is null then
            select id
            into event_id
            from public.anime_events
            where anime_id = observation_row.anime_id
              and event_type = 'anime_completed';
          else
            row_event_created := true;
          end if;

          insert into public.user_notifications (
            user_id,
            anime_event_id,
            anime_id,
            type,
            title,
            message
          )
          select distinct library.user_id,
                 event_id,
                 observation_row.anime_id,
                 'anime_completed',
                 'Finished airing',
                 anime_row.title_display || ' has finished airing.'
          from public.user_anime library
          left join public.user_notification_preferences preferences
            on preferences.user_id = library.user_id
          where library.anime_id = observation_row.anime_id
            and library.list_status in ('watching', 'wishlist')
            and coalesce(preferences.anime_completed_enabled, true)
          on conflict (user_id, anime_event_id) do nothing;

          get diagnostics inserted_notifications = row_count;
          row_notification_count := inserted_notifications;

          update public.anime_event_state
          set is_completed = true,
              completion_initialized = true,
              completed_at = observation_row.event_occurred_at,
              last_checked_at = now()
          where anime_id = observation_row.anime_id;
        end if;
      else
        raise exception 'unsupported observation type: %', observation_row.observation_type;
      end if;

      update public.notification_observations
      set status = 'completed',
          processed_at = now(),
          last_error_code = null,
          last_error_message = null
      where id = observation_row.id;

      processed_count := processed_count + 1;
      baseline_count := baseline_count + case when row_outcome = 'baseline' then 1 else 0 end;
      ignored_count := ignored_count + case when row_outcome = 'ignored' then 1 else 0 end;
      event_count := event_count + case when row_event_created then 1 else 0 end;
      notification_count := notification_count + row_notification_count;
    exception when others then
      get stacked diagnostics
        error_message = message_text,
        error_state = returned_sqlstate;

      update public.notification_observations
      set attempt_count = attempt_count + 1,
          status = case when attempt_count + 1 >= 8 then 'dead_letter' else 'retry' end,
          available_at = now() + make_interval(
            secs => least(21600, 60 * power(2, least(attempt_count, 8))::integer)
          ),
          last_error_code = left(coalesce(error_state, 'unknown'), 100),
          last_error_message = left(coalesce(error_message, 'Observation processing failed.'), 500)
      where id = observation_row.id;

      if observation_row.attempt_count + 1 >= 8 then
        dead_letter_count := dead_letter_count + 1;
      else
        retry_count := retry_count + 1;
      end if;
    end;
  end loop;

  select count(*)::integer
  into remaining_count
  from public.notification_observations
  where status in ('pending', 'retry')
    and available_at <= now();

  return jsonb_build_object(
    'status', 'processed',
    'processed', processed_count,
    'baselined', baseline_count,
    'ignored', ignored_count,
    'eventsCreated', event_count,
    'notificationsCreated', notification_count,
    'retried', retry_count,
    'deadLettered', dead_letter_count,
    'remaining', remaining_count
  );
end;
$$;

revoke all on function public.commit_catalog_feed_refresh_v2(
  text, integer, date, integer, boolean, integer, uuid, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.commit_catalog_feed_refresh_v2(
  text, integer, date, integer, boolean, integer, uuid, jsonb, jsonb
) to service_role;

revoke all on function public.process_notification_observation_batch(integer)
  from public, anon, authenticated;
grant execute on function public.process_notification_observation_batch(integer)
  to service_role;
