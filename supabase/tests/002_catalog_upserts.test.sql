begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select lives_ok(
  $$
    select public.upsert_anilist_anime_batch_v1(
      '[{"anilist_id":990001,"source_url":"https://anilist.co/anime/990001","title_display":"Integration Anime","title_normalized":"integration anime","cover_image":"basic.jpg","average_score":70}]'::jsonb,
      'basic'
    )
  $$,
  'basic AniList metadata can be inserted'
);
select is(
  (select count(*)::integer from public.anime where anilist_id = 990001),
  1,
  'AniList identity creates one catalog row'
);
select is(
  (select metadata_tier from public.anime where anilist_id = 990001),
  'basic'::text,
  'new feed metadata starts at the basic tier'
);

select lives_ok(
  $$
    select public.upsert_anilist_anime_batch_v1(
      '[{"anilist_id":990001,"source_url":"https://anilist.co/anime/990001","title_display":"Integration Anime Detail","title_normalized":"integration anime detail","cover_image":"detail.jpg","description":"Rich description","genres":["Drama"],"site_url":"https://anilist.co/anime/990001"}]'::jsonb,
      'detail'
    )
  $$,
  'detail metadata upgrades a basic row'
);
select is(
  (select metadata_tier from public.anime where anilist_id = 990001),
  'detail'::text,
  'detail metadata upgrades the tier'
);
select is(
  (select description from public.anime where anilist_id = 990001),
  'Rich description'::text,
  'detail metadata is stored'
);

select lives_ok(
  $$
    select public.upsert_anilist_anime_batch_v1(
      '[{"anilist_id":990001,"source_url":"https://anilist.co/anime/990001","title_display":"Integration Anime","title_normalized":"integration anime","cover_image":"basic-new.jpg","average_score":75}]'::jsonb,
      'basic'
    )
  $$,
  'later feed metadata can refresh dynamic fields'
);
select is(
  (select metadata_tier from public.anime where anilist_id = 990001),
  'detail'::text,
  'basic refresh cannot downgrade detail metadata'
);
select is(
  (select description from public.anime where anilist_id = 990001),
  'Rich description'::text,
  'basic refresh cannot erase detail fields'
);
select is(
  (
    select count(*)::integer
    from public.anime_sources
    where provider = 'anilist' and external_id = '990001'
  ),
  1,
  'AniList provenance is unique and recorded'
);
select throws_ok(
  $$update public.anime set anilist_id = 990002 where anilist_id = 990001$$,
  'P0001',
  'an assigned AniList identity cannot be changed or cleared',
  'assigned AniList identity is immutable'
);
select throws_ok(
  $$
    select public.upsert_anilist_anime_batch_v1(
      '[{"anilist_id":990003,"title_display":"Duplicate A","title_normalized":"duplicate a"},{"anilist_id":990003,"title_display":"Duplicate B","title_normalized":"duplicate b"}]'::jsonb,
      'basic'
    )
  $$,
  'P0001',
  'records require unique positive AniList IDs and non-empty titles',
  'invalid batches fail atomically'
);

select lives_ok(
  $$
    select public.upsert_offline_anime_batch_v1(
      '[{"anilist_id":null,"source_fingerprint":"integration:promote","source_urls":["https://example.test/anime"],"title_display":"Offline Integration Anime","title_normalized":"offline integration anime"}]'::jsonb
    )
  $$,
  'offline-only catalog rows can be inserted'
);
select lives_ok(
  $$
    select public.upsert_offline_anime_batch_v1(
      '[{"anilist_id":990004,"source_fingerprint":"integration:promote","source_urls":["https://anilist.co/anime/990004"],"title_display":"Offline Integration Anime","title_normalized":"offline integration anime"}]'::jsonb
    )
  $$,
  'an exact offline fingerprint can be promoted to AniList identity'
);
select is(
  (
    select count(*)::integer
    from public.anime
    where source_fingerprint = 'integration:promote' and anilist_id = 990004
  ),
  1,
  'offline promotion retains one physical catalog row'
);

select * from finish();
rollback;
