# Noir

Noir is a public anime discovery site built with Next.js and powered by AniList.

## Features

- Trending-first homepage
- URL-based anime search
- Dedicated anime detail pages
- Server-side AniList integration
- Null-safe metadata normalization
- Production-ready Vercel deployment target
- Supabase auth/database scaffolding for saved anime and profiles

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Copy `.env.example` to `.env.local` when you are ready to enable Supabase-backed features.

The default development server uses Turbopack. Use `npm run dev:webpack` only
when diagnosing a bundler-specific problem.

## Local Supabase

Noir includes a reproducible Supabase CLI project under `supabase/`. Start
Docker Desktop, then run:

```bash
npm run db:start
npm run db:reset
npm run db:test
```

Use the local API URL and keys printed by `npm run db:start` in `.env.local`.
Local Studio is available at `http://127.0.0.1:54323`.

The migration files under `supabase/migrations/` are now the canonical schema
history. Create future migrations with:

```bash
npm run db:new -- descriptive_migration_name
```

Do not edit a migration after it has been applied. See
[`supabase/README.md`](supabase/README.md) for the one-time hosted-project
adoption procedure and safe remote deployment workflow.

The `Verify` GitHub Actions workflow runs application checks and recreates the
database from every migration before running the pgTAP suite on each push and
pull request.

## Runtime modes

Noir's public discovery feeds always work directly from AniList. Supabase adds progressively more capability:

- **AniList only:** no Supabase variables are required for homepage feeds, search, or anime details.
- **Snapshot read-only:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` enable public catalog and stored-feed reads as well as authentication.
- **Persistent catalog:** `SUPABASE_SERVICE_ROLE_KEY` additionally enables server-side catalog writes, feed snapshots, refresh state, and notification fan-out.

Keep `SUPABASE_SERVICE_ROLE_KEY` server-side. Never expose it to browser code or commit it to source control.

Persistent deployments must apply the SQL migrations in order. Migration
`20260719000800_atomic_catalog_feed_refresh.sql` adds transactional feed snapshots,
page-scoped refresh leases, and consistent public snapshot reads. The legacy
refresh-state table remains in place for rollback compatibility.

Migration `20260719000900_notification_observation_pipeline.sql` atomically records
notification observations with feed snapshots and processes them through an
idempotent, retryable database worker. Configure `CRON_SECRET` to enable the
protected daily recovery job; successful notification-feed refreshes also
request immediate best-effort processing.

Migration `20260719001000_catalog_identity_and_metadata_upserts.sql` makes provider
identities immutable, records source provenance, and adds null-preserving bulk
upserts for AniList and the offline dataset. Detail metadata is refreshed after
`ANIME_DETAIL_TTL_HOURS` (seven days by default) instead of being cached
indefinitely.

Migration `20260720001100_tracked_notification_collection.sql` adds the scheduled,
traffic-independent notification collector. The protected cron route scans every
distinct AniList title in Wishlist or Watching in batches, records each run in
`sync_runs`, queues deduplicated observations, and then drains the notification
worker. The first scan establishes a no-spam baseline; later episode or completion
changes create user notifications according to saved preferences.

## Scripts

- `npm run dev`
- `npm run dev:webpack`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm test`
- `npm run test:e2e:install` (once per machine)
- `npm run test:e2e`
- `npm run db:start`
- `npm run db:stop`
- `npm run db:reset`
- `npm run db:status`
- `npm run db:test`
- `npm run test:integration`

## Notes

- Public discovery does not require authentication or a database.
- Saving anime, profiles, and notifications require Supabase.
- Vercel Cron invokes `/api/internal/notifications/process` daily to collect
  tracked-title updates and process the durable queue. The endpoint is disabled
  unless `CRON_SECRET` is configured. Cron jobs run on production deployments;
  call the endpoint with the same bearer token when verifying it locally.
- If AniList is unavailable, configured deployments can fall back to the latest valid stored feed.
- AniList requests are made server-side only.
- A custom domain can be attached later in Vercel without changing the app code.
