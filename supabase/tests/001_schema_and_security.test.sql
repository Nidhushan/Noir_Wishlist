begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'anime', 'anime table exists');
select has_table('public', 'catalog_feed_snapshots', 'feed snapshots table exists');
select has_table('public', 'catalog_feed_items', 'feed items table exists');
select has_table('public', 'catalog_feed_refresh_state', 'atomic refresh state exists');
select has_table('public', 'user_notifications', 'user notifications table exists');
select has_table('public', 'notification_observations', 'notification observations table exists');
select has_table('public', 'anime_sources', 'anime provenance table exists');
select has_column('public', 'anime', 'row_version', 'anime rows are versioned');

select has_function(
  'public',
  'try_acquire_catalog_feed_lease',
  array['text', 'integer', 'uuid', 'integer'],
  'feed lease RPC exists'
);
select has_function(
  'public',
  'process_notification_observation_batch',
  array['integer'],
  'notification worker RPC exists'
);
select has_function(
  'public',
  'upsert_anilist_anime_batch_v1',
  array['jsonb', 'text'],
  'AniList catalog RPC exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.upsert_anilist_anime_batch_v1(jsonb,text)',
    'EXECUTE'
  ),
  'service role can execute catalog writes'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.upsert_anilist_anime_batch_v1(jsonb,text)',
    'EXECUTE'
  ),
  'anonymous clients cannot execute catalog writes'
);
select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.anime_sources'::regclass
  ),
  true,
  'anime provenance has row-level security enabled'
);

select * from finish();
rollback;
