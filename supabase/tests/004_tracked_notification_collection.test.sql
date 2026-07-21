begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-000000000011'::uuid,
  'authenticated',
  'authenticated',
  'notification-test@example.com',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, username, email)
values (
  '00000000-0000-0000-0000-000000000011'::uuid,
  'ntfy_test',
  'notification-test@example.com'
);

select lives_ok(
  $$
    select public.upsert_anilist_anime_batch_v1(
      '[{"anilist_id":990040,"source_url":"https://anilist.co/anime/990040","title_display":"Tracked Notification Anime","title_normalized":"tracked notification anime"}]'::jsonb,
      'basic'
    )
  $$,
  'tracked anime is persisted'
);

insert into public.user_anime (user_id, anime_id, list_status)
select '00000000-0000-0000-0000-000000000011'::uuid,
       anime.id,
       'wishlist'
from public.anime anime
where anime.anilist_id = 990040;

insert into public.sync_runs (job_type, status, scope)
values ('notification_collection', 'running', '{}'::jsonb);

select is(
  (
    select count(*)::integer
    from public.list_notification_tracking_targets_v1(0, 100)
    where anilist_id = 990040
  ),
  1,
  'wishlist anime is returned as a tracking target'
);

select is(
  (
    public.enqueue_notification_observation_batch_v1(
      '[{"observation_type":"new_episode","anilist_id":990040,"episode_number":1,"event_occurred_at":"2026-07-20T00:00:00Z","payload":{}}]'::jsonb,
      (select max(id) from public.sync_runs where job_type = 'notification_collection')
    )->>'observationsQueued'
  )::integer,
  1,
  'tracked collector queues the first observation'
);

select is(
  (
    select source_feed
    from public.notification_observations observation
    join public.anime anime on anime.id = observation.anime_id
    where anime.anilist_id = 990040 and observation.episode_number = 1
  ),
  'tracked-anime'::text,
  'queued observations retain their collector source'
);

select is(
  (
    public.enqueue_notification_observation_batch_v1(
      '[{"observation_type":"new_episode","anilist_id":990040,"episode_number":1,"event_occurred_at":"2026-07-20T00:00:00Z","payload":{}}]'::jsonb,
      (select max(id) from public.sync_runs where job_type = 'notification_collection')
    )->>'observationsQueued'
  )::integer,
  0,
  'duplicate collection is idempotent'
);

select is(
  (public.process_notification_observation_batch(50)->>'baselined')::integer,
  1,
  'first tracked observation establishes the baseline'
);

select is(
  (select count(*)::integer from public.user_notifications),
  0,
  'baseline does not create historical user notifications'
);

select is(
  (
    public.enqueue_notification_observation_batch_v1(
      '[{"observation_type":"new_episode","anilist_id":990040,"episode_number":2,"event_occurred_at":"2026-07-21T00:00:00Z","payload":{}}]'::jsonb,
      (select max(id) from public.sync_runs where job_type = 'notification_collection')
    )->>'observationsQueued'
  )::integer,
  1,
  'a later episode is queued'
);

select is(
  (public.process_notification_observation_batch(50)->>'notificationsCreated')::integer,
  1,
  'a later episode fans out to the wishlist user'
);

select is(
  (
    select count(*)::integer
    from public.user_notifications notification
    where notification.user_id = '00000000-0000-0000-0000-000000000011'::uuid
      and notification.type = 'new_episode'
  ),
  1,
  'the user receives one durable episode notification'
);

select throws_ok(
  $$
    select public.enqueue_notification_observation_batch_v1(
      '[{"observation_type":"new_episode","anilist_id":990040,"episode_number":3,"event_occurred_at":"2026-07-22T00:00:00Z","payload":{}},{"observation_type":"new_episode","anilist_id":990040,"episode_number":3,"event_occurred_at":"2026-07-22T00:00:00Z","payload":{}}]'::jsonb,
      null
    )
  $$,
  'observations must be unique and reference stored AniList anime',
  'duplicate entries in one collection batch are rejected'
);

select throws_ok(
  $$
    select public.enqueue_notification_observation_batch_v1(
      '[{"observation_type":"new_episode","anilist_id":999999,"episode_number":1,"event_occurred_at":"2026-07-22T00:00:00Z","payload":{}}]'::jsonb,
      null
    )
  $$,
  'observations must be unique and reference stored AniList anime',
  'unknown anime IDs are rejected'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.enqueue_notification_observation_batch_v1(jsonb,bigint)',
    'EXECUTE'
  ),
  'authenticated users cannot enqueue server observations'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.enqueue_notification_observation_batch_v1(jsonb,bigint)',
    'EXECUTE'
  ),
  'service role can enqueue server observations'
);

select * from finish();
rollback;
