---
paths:
  - src/migrations/**/*.ts
  - src/migrations/**/*.json
---

# Database Migrations

**Development** uses Postgres with `push: true` (auto-schema-sync via Drizzle).
**Production** uses explicit migration files, applied automatically in-process on server boot via `prodMigrations`.

The old 36 SQLite/D1 migrations were deleted. The Postgres baseline is managed via migration files committed to git; they auto-apply on Railway boot (no manual `pnpm payload migrate` step in the deploy flow).

## First-time dev setup

Dev uses `push: true`, so the schema auto-syncs against your local Postgres on
boot — no `pnpm payload migrate` needed locally. Point `DATABASE_URL` at a running
Postgres (Docker or Railway). Production applies migration files automatically
in-process on server boot via `prodMigrations` (see "Production workflow" below).

## Creating a migration

There is **one** entry point: `pnpm payload <command>` (the `payload` script in
`package.json` is a passthrough to the Payload CLI). The old
`db:migrate` / `db:migrations:create` aliases were removed — they added a second
set of names for the same commands and made argument forwarding look like the
culprit whenever a command failed for an unrelated reason (see "When a payload
command seems to do nothing" below). Pass the name as the first argument:
`pnpm payload migrate:create my_migration_name`.

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
timeout 30 pnpm payload migrate:create <name> --skip-empty < /dev/null
```

(No `--` separator: pnpm 11 forwards run-script args as-is, and a literal `--`
reaches Payload and breaks its flag parsing — verified: with `--` the blank
prompt still rendered.) Then classify the outcome:

| Outcome | Signal | Action |
| --- | --- | --- |
| Migration created | exit 0, new `.ts` + `.json` pair in `src/migrations/` | Validate (migration-validator skill), review the `.ts` for duplicate DDL (snapshot trap below), commit both files |
| No schema changes | exit 0, no new files | Report it — dev `push: true` may have already synced, or a pending migration already captures the schema. Not an error |
| Interactive hang | exit 124 (timeout), no new files | Drizzle hit the rename-vs-create prompt. Hand the user the plain `pnpm payload migrate:create <name>` to run interactively, then validate + commit their result |
| Partial write | exit 124, lone `.json` (no `.ts`) | The `.json` snapshot is written before the `.ts`; delete the orphaned `.json`, then hand off to the user as above |
| Other error | exit ≥ 1 with output | Surface the error; don't retry blindly |

On success, augment the `.ts` only if needed (see "Augmenting" below) and
commit both files.

## When a payload command seems to do nothing

Three failure modes account for nearly every "the command just exited with no
output" report. All were diagnosed from the CLI source; none is a problem with
our script wiring — which is why the `db:migrate` / `db:migrations:create`
aliases were removed rather than rewritten.

### 1. `generate:types` prints "Compiling…" and nothing else — that's success

`payload/dist/bin/generateTypes.js` compiles the schema, **diffs it against the
file on disk, and returns early when they are identical** — before the "Types
written to …" log. So:

- `Compiling TS types…` **and** `Types written to …` → the file changed.
- `Compiling TS types…` alone → **no schema change**; nothing to write.

There is no third state and no hang. Note this makes the output of a *stale*
read misleading: if you edit a schema and immediately `grep` the generated file
in the same shell pipeline, you can read the previous contents. Re-read the file
as a separate step.

### 2. Dev email hits ethereal.email on **every** CLI invocation

Every payload command loads `payload.config.ts`, and outside production that
config builds `nodemailerAdapter({})` with no `transportOptions`. Payload reads
that as "give me a test account" and calls `nodemailer.createTestAccount()` —
a live HTTPS request to ethereal.email — before the command does any work. It's
why every CLI run prints:

```
E-mail configured with ethereal.email test account.
Mock email account username: …
```

When that request fails (ethereal rate-limits, or you're offline) the adapter
`throw`s `InvalidConfiguration`. Payload's `bin.js` starts the CLI with a bare
`void start()` and **no `.catch()`**, so the rejection kills the process with
**exit 0 and no output at all**.

This is the intermittent one: run `pnpm payload migrate:status` several times in
a row and it alternates between a full table and zero lines, same command, same
tree. If a payload command produced *nothing whatsoever*, this is almost always
why — just run it again.

The permanent fix is to stop making a network call for dev email (nodemailer's
`jsonTransport` / `streamTransport` keeps it local), at the cost of the ethereal
preview URL. Not yet done — raise it before changing dev email behaviour.

### 3. A desynced `src/migrations/index.ts` breaks **every** payload command

`payload.config.ts` imports `migrations` from `src/migrations/index.ts` for
`prodMigrations`, and that index statically imports every migration file. Delete
or rename a migration `.ts` without updating the index and the config fails to
load, so `migrate:create`, `generate:types`, `migrate:status` — everything —
dies at startup:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/migrations/<name>'
    imported from .../src/migrations/index.ts
```

The message is at the *top* of a long stack trace, so it scrolls away, and it is
lost entirely if you pipe the command through `head`/`tail`. **When a payload
command fails inexplicably, run it once with output redirected to a file and
read the first 20 lines.**

Fix by restoring the deleted file or removing its `import` + `migrations[]` entry
from the index (the index is regenerated wholesale by the next successful
`migrate:create`).

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
There is no manual `pnpm payload migrate` step in the deploy flow.

**Local authoring → commit → auto-apply on next Railway boot**, unchanged:

1. Run `pnpm payload migrate:create` locally; commit both `.ts` and `.json` files.
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
`push` recreate it (dev), or re-run `pnpm payload migrate` from a clean database —
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

**Default: don't.** Leave the output of `pnpm payload migrate:create` exactly
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
