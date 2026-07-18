---
paths:
  - src/migrations/**/*.ts
  - src/migrations/**/*.json
---

# Database Migrations

**Development** uses Postgres with `push: true` (auto-schema-sync via Drizzle).
**Production** uses explicit migration files, applied automatically in-process on server boot via `prodMigrations`.

The old 36 SQLite/D1 migrations were deleted. The Postgres baseline is managed via migration files committed to git; they auto-apply on Railway boot (no manual `pnpm db:migrate` step in the deploy flow).

## First-time dev setup

Dev uses `push: true`, so the schema auto-syncs against your local Postgres on
boot — no `pnpm db:migrate` needed locally. Point `DATABASE_URL` at a running
Postgres (Docker or Railway). Production applies migration files automatically
in-process on server boot via `prodMigrations` (see "Production workflow" below).

## Creating a migration

`pnpm db:migrations:create` is just an alias for `pnpm payload migrate:create`
(see `package.json`) — both run the same Payload CLI, so they behave
identically. Pass the name as the first argument:
`pnpm db:migrations:create my_migration_name`.

**Attempt it non-interactively first; hand off to the user only if it would
become interactive.** The command has exactly two interactive prompts (verified
against Payload 3.86.0 / drizzle-kit 0.31.7 source):

1. **Blank-migration confirm** — fires only when **no schema changes** are
   detected. The `--skip-empty` flag suppresses it entirely: with no changes the
   command exits 0 immediately with no files; with changes the flag is a no-op.
2. **Rename-vs-create prompt** — fires from drizzle-kit internals on ambiguous
   column changes (drop+add that looks like a rename). No flag bypasses it
   (`--force-accept-warning` does not); on non-TTY stdin it **hangs
   indefinitely** before writing any files. Only a timeout catches it.

So run:

```bash
timeout 30 pnpm db:migrations:create <name> --skip-empty < /dev/null
```

(No `--` separator: pnpm 11 forwards run-script args as-is, and a literal `--`
reaches Payload and breaks its flag parsing — verified: with `--` the blank
prompt still rendered.) Then classify the outcome:

| Outcome | Signal | Action |
| --- | --- | --- |
| Migration created | exit 0, new `.ts` + `.json` pair in `src/migrations/` | Validate (migration-validator skill), review the `.ts` for duplicate DDL (snapshot trap below), commit both files |
| No schema changes | exit 0, no new files | Report it — dev `push: true` may have already synced, or a pending migration already captures the schema. Not an error |
| Interactive hang | exit 124 (timeout), no new files | Drizzle hit the rename-vs-create prompt. Hand the user the plain `pnpm db:migrations:create <name>` to run interactively, then validate + commit their result |
| Partial write | exit 124, lone `.json` (no `.ts`) | The `.json` snapshot is written before the `.ts`; delete the orphaned `.json`, then hand off to the user as above |
| Other error | exit ≥ 1 with output | Surface the error; don't retry blindly |

On success, augment the `.ts` only if needed (see "Augmenting" below) and
commit both files.

## Running locally

```bash
pnpm payload migrate          # apply pending migrations to DATABASE_URL
pnpm payload migrate:down     # roll back last migration
```

Never pipe through `| tail` or background — output is buffered and you lose
visibility into progress and any interactive prompts.

## Production workflow

Migrations are applied **automatically in-process on server boot** via
`prodMigrations` in `src/payload.config.ts` (see `postgresAdapter({ prodMigrations: migrations })`).
There is no manual `pnpm db:migrate` step in the deploy flow.

**Local authoring → commit → auto-apply on next Railway boot**, unchanged:

1. Run `pnpm db:migrations:create` locally; commit both `.ts` and `.json` files.
2. On next deploy, Railway boots the Node app, Payload's `prodMigrations` hook
   runs automatically, applies any pending migrations, and the server starts.
3. No separate migration step needed; build → start → migrated in one process.

## File requirements

Both `.ts` and `.json` files are required for each migration:

- `.ts` contains migration logic (SQL or Payload operations)
- `.json` is the Drizzle schema snapshot used for rollback

**Data-only migrations** (no schema changes): copy the previous migration's
`.json` and rename to match your new timestamp. This keeps the schema-snapshot
chain intact.

## Reviewing generated migrations

Before deploy, scan each new generated `.ts` against the earlier migrations
in the chain — the **whole applied chain**, not just the same pending batch
(see the snapshot trap below). If it repeats `CREATE TABLE`, `CREATE INDEX`,
or `ALTER TABLE ADD COLUMN` for schema already introduced earlier in the
chain, stop and trim or regenerate it; adding `IF NOT EXISTS` to a new
migration is only a replay-recovery tool, not a substitute for a clean
migration delta.

### The out-of-order snapshot trap (duplicate re-emission)

`migrate:create` picks its diff base as the **newest-by-filename-timestamp**
`.json` snapshot — not the last entry in `index.ts`. Migrations authored on
parallel branches can merge out of timestamp order (e.g.
`20260705_161112_bcp47` sorts after `20260705_160029_sy_atlas_translations_views`
but was generated on a branch that predates 160029's schema change). The
newest-by-timestamp snapshot is then **stale**, and the next `migrate:create`
re-emits DDL that is already applied — replaying it fails (`ADD COLUMN` on an
existing column) and aborts the in-process boot migration on deploy. This
produced a duplicate of 160029's views DDL, caught and removed in #566.

- When a generated migration contains DDL you didn't just cause with a schema
  edit, suspect this trap: grep the repeated table/column names across
  `src/migrations/*.ts` to find the earlier migration that already ships them.
- A freshly generated migration's snapshot reflects the **full current
  schema**, so once one lands with the highest timestamp the chain is healed
  for future runs.
- After merging parallel branches that both added migrations, verify the
  highest-timestamp snapshot post-merge actually contains both branches'
  schema before generating the next migration.

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
- Deferrable foreign keys allow safe constraint reordering
- `ALTER TABLE` is proper SQL (column rename, type change, constraint update)
- Connection pooling via Drizzle
- Full-featured transaction support for complex migrations

The old SQLite/D1 gotchas **no longer apply**. Migrations are much simpler to reason about.

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
