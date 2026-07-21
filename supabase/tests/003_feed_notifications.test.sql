begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select lives_ok(
  $$
    select public.upsert_anilist_anime_batch_v1(
      '[{"anilist_id":990020,"source_url":"https://anilist.co/anime/990020","title_display":"Feed Integration Anime","title_normalized":"feed integration anime"}]'::jsonb,
      'basic'
    )
  $$,
  'feed test anime is persisted first'
);
select is(
  public.try_acquire_catalog_feed_lease(
    'new-episodes', 99, '00000000-0000-0000-0000-000000000001'::uuid, 180
  )->>'status',
  'acquired'::text,
  'first worker acquires the feed lease'
);
select is(
  public.try_acquire_catalog_feed_lease(
    'new-episodes', 99, '00000000-0000-0000-0000-000000000002'::uuid, 180
  )->>'status',
  'busy'::text,
  'a second worker cannot acquire an active lease'
);
select lives_ok(
  $$
    select public.commit_catalog_feed_refresh_v2(
      'new-episodes',
      99,
      current_date,
      1,
      false,
      1,
      '00000000-0000-0000-0000-000000000001'::uuid,
      '[{"position":1,"anilist_id":990020}]'::jsonb,
      '[{"observation_type":"new_episode","anilist_id":990020,"episode_number":1,"event_occurred_at":"2026-07-19T00:00:00Z","payload":{}}]'::jsonb
    )
  $$,
  'feed snapshot and notification observation commit atomically'
);
select is(
  (
    select item_count
    from public.catalog_feed_snapshots
    where feed_type = 'new-episodes' and page = 99 and snapshot_date = current_date
  ),
  1,
  'snapshot records its exact item count'
);
select is(
  (
    select count(*)::integer
    from public.catalog_feed_items
    where feed_type = 'new-episodes' and page = 99 and snapshot_date = current_date
  ),
  1,
  'snapshot items are committed with the snapshot'
);
select is(
  (
    select count(*)::integer
    from public.notification_observations
    where source_feed = 'new-episodes' and source_page = 99 and status = 'pending'
  ),
  1,
  'notification observation is queued'
);
select is(
  (public.process_notification_observation_batch(50)->>'baselined')::integer,
  1,
  'the first observation establishes a no-spam baseline'
);
select is(
  (
    select count(*)::integer
    from public.notification_observations
    where source_feed = 'new-episodes' and source_page = 99 and status = 'completed'
  ),
  1,
  'baseline observation completes successfully'
);
select is(
  (
    select count(*)::integer
    from public.anime_events event
    join public.anime anime on anime.id = event.anime_id
    where anime.anilist_id = 990020
  ),
  0,
  'baseline processing does not create a historical event'
);
select is(
  public.try_acquire_catalog_feed_lease(
    'new-episodes', 99, '00000000-0000-0000-0000-000000000003'::uuid, 180
  )->>'status',
  'acquired'::text,
  'the lease can be reacquired after a successful commit'
);
select lives_ok(
  $$
    select public.commit_catalog_feed_refresh_v2(
      'new-episodes',
      99,
      current_date,
      1,
      false,
      1,
      '00000000-0000-0000-0000-000000000003'::uuid,
      '[{"position":1,"anilist_id":990020}]'::jsonb,
      '[{"observation_type":"new_episode","anilist_id":990020,"episode_number":2,"event_occurred_at":"2026-07-19T01:00:00Z","payload":{}}]'::jsonb
    )
  $$,
  'a later episode observation can be committed'
);
select is(
  (public.process_notification_observation_batch(50)->>'eventsCreated')::integer,
  1,
  'a later episode creates one event'
);
select is(
  (
    select count(*)::integer
    from public.anime_events event
    join public.anime anime on anime.id = event.anime_id
    where anime.anilist_id = 990020 and event.episode_number = 2
  ),
  1,
  'the new episode event is durable'
);
select is(
  (
    select count(*)::integer
    from public.notification_observations
    where source_feed = 'new-episodes' and source_page = 99 and status = 'completed'
  ),
  2,
  'both observations complete exactly once'
);

select * from finish();
rollback;
