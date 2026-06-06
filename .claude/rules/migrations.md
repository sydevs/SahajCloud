---
paths:
  - src/migrations/**/*.ts
  - src/migrations/**/*.json
---

# Database Migrations

**Development** uses Postgres with `push: true` (auto-schema-sync via Drizzle).
**Production** uses explicit migration files via `pnpm db:migrate` (= `payload migrate`).

The old 36 SQLite/D1 migrations were deleted. The Postgres baseline will be generated fresh on first Railway deploy against a live Postgres DB.

## First-time dev setup

Dev uses `push: true`, so the schema auto-syncs against your local Postgres on
boot — no `pnpm db:migrate` needed locally. Point `DATABASE_URL` at a running
Postgres (Docker or Railway). Production/CI apply migration files via
`pnpm db:migrate` instead of push.

## Creating a migration

**Ask the user to run `pnpm db:migrations:create` for you — do not run it
yourself.** The command prompts interactively for a migration name and hangs
silently when backgrounded or piped (the shell's stdout buffering hides the
prompt). Agents that attempt it freeze their shell and waste real time
before being interrupted.

Pause, describe the schema changes you made, and ask the user to run the
command and confirm the new `.ts` + `.json` pair exists. Then augment the
`.ts` if needed (see "Augmenting" below) and commit both files.

## Running

```bash
pnpm payload migrate          # apply pending
pnpm payload migrate:down     # roll back last
```

Never pipe through `| tail` or background — output is buffered and you lose
visibility into progress and any interactive prompts.

## File requirements

Both `.ts` and `.json` files are required for each migration:

- `.ts` contains migration logic (SQL or Payload operations)
- `.json` is the Drizzle schema snapshot used for rollback

**Data-only migrations** (no schema changes): copy the previous migration's
`.json` and rename to match your new timestamp. This keeps the schema-snapshot
chain intact.

## Reviewing generated migrations

Before deploy, scan each new generated `.ts` against the earlier migrations
in the same pending batch. If it repeats `CREATE TABLE`, `CREATE INDEX`, or
`ALTER TABLE ADD COLUMN` for schema already introduced earlier in the chain,
stop and trim or regenerate it; adding `IF NOT EXISTS` to a new migration is
only a replay-recovery tool, not a substitute for a clean migration delta.

When adding required relationship fields to an existing table, keep the SQL
column nullable unless the migration also backfills every existing row before
enforcing `NOT NULL`. Payload validation can require the field at the app
layer while old rows are hydrated after deploy.

If a field is added and renamed before deploy, inspect the generated rebuild.
Drizzle can emit `SELECT new_column FROM old_table`, which fails because the
old table only has the previous column name. Prefer a guarded
`ALTER TABLE ... RENAME COLUMN` for that narrow rename.

## Squashing (preserve data)

When the migration chain gets painfully large, squash it (see DEPLOYMENT.md).
After pulling a squash commit, reset your local Postgres so it no longer carries
pre-squash `payload_migrations` rows: drop the local database/schema and let
`push` recreate it (dev), or re-run `pnpm db:migrate` from a clean database —
otherwise future migrations behave inconsistently.

## Postgres Advantages

Postgres migrations are **atomic transactions** with **real transactional DDL**:

- All statements in a migration succeed or all fail together (no partial state)
- No statement boundary gotchas (unlike D1's per-call `db.run()` isolation)
- Deferrable foreign keys eliminate the need for `PRAGMA foreign_keys=OFF` tricks
- `ALTER TABLE` is proper SQL (column rename, type change, constraint update)
- Connection pooling via Drizzle; no per-call isolation issues

The old SQLite/D1 gotchas (polymorphic-FK renames, `_rels` cascade-null bugs) **no longer apply**. Migrations are much simpler to reason about.

## Augmenting generated migrations

**Default: don't.** Leave the output of `pnpm db:migrations:create` exactly
as generated. Hand-editing has repeatedly caused FK / table-rebuild bugs
(polymorphic FK renames, `_rels` rebuilds, versioned-table companion drift),
so the cost of a clean post-deploy resync is lower than the risk of a
broken migration.

Augment only when:

1. The migration fails without the edit (e.g. the polymorphic-FK bug above), or
2. The user has explicitly asked for the augmentation.

If an issue spec calls for a data backfill inside the migration, **surface
the trade-off to the user** ("spec asks for backfill; doing so historically
causes FK issues — prefer a post-deploy sync/job?") rather than deciding
unilaterally.

When you do edit, change only what's necessary — no defensive NULL-ing,
no redundant cleanups FK cascade already handles. Features should also be
designed so an unpopulated new column degrades gracefully (endpoints skip
rows with a missing field) until a follow-up sync/job hydrates it.
