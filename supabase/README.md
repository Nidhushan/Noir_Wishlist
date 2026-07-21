# Supabase database workflow

This directory is the canonical database source for Noir.

- `config.toml` defines the reproducible local Supabase stack.
- `migrations/` contains ordered, immutable schema migrations.
- `tests/` contains transactional pgTAP integration tests.

## Local workflow

Docker Desktop or another Docker-compatible runtime must be running.

```bash
npm run db:start
npm run db:reset
npm run db:test
```

`db:reset` is explicitly local. It destroys only the local Supabase database,
then replays every migration. The pgTAP tests wrap their fixtures in
transactions and roll them back.

Create future migrations with:

```bash
npm run db:new -- descriptive_migration_name
```

Never edit an already-applied migration. Add a new migration instead.

## One-time adoption for the existing hosted project

Migrations `001` through `010` were originally applied through the Supabase SQL
Editor, so their schema exists without CLI history records. Link the correct
project and inspect both sides before repairing the ledger:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:status:remote
```

Only after independently confirming that all ten migrations are present in the
linked database, record them as applied without rerunning their SQL:

```bash
npm run db:adopt:remote
npm run db:status:remote
```

Every local and remote version should then appear on the same row. The adoption
command changes migration history only; it does not execute migration SQL.

For later migrations, preview remote work before applying it:

```bash
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Treat `db push --linked` as a production database change and review the dry run
first. Never run `supabase db reset --linked` against production.
