# Database Migrations

**Development** uses Postgres with `push: true` (Drizzle auto-syncs the
schema — no `pnpm db:migrate` step locally). **Production** applies
migration files automatically, in-process on server boot, via
`prodMigrations` in `src/payload.config.ts`
(`postgresAdapter({ prodMigrations: migrations })`). Point `DATABASE_URL` at
a running Postgres (Docker or Railway) for local dev.

> **History footnote.** This app moved from Cloudflare Workers + D1 (SQLite)
> to Railway + Postgres (infra #466). The 36 old D1 migrations were
> deleted — they imported `@payloadcms/db-d1-sqlite` and do not apply to
> Postgres. Only the **data** migrated 1:1, via a one-off ETL script
> (`scripts/etl-d1-to-postgres.ts`). The schema restarted from a fresh
> Postgres baseline, `20260606_050852_initial_schema.{ts,json}`. This is the
> only place this history is recorded — do not re-add it elsewhere. Postgres
> migrations are real transactional DDL (every statement in a migration
> commits or rolls back together, foreign keys can defer, `ALTER TABLE`
> renames/retypes a column directly). The old SQLite/D1 constraints no
> longer apply.

## Creating a migration

`pnpm db:migrations:create` aliases `pnpm payload migrate:create` (see
`package.json`). Pass the name as the first argument.

**Try it non-interactively first. Hand off to the user only if it would
become interactive.** It has exactly two interactive prompts (verified
against Payload 3.86.0 / drizzle-kit 0.31.7):

1. **Blank-migration confirm** — fires only with no schema changes.
   `--skip-empty` suppresses it (a no-op when changes exist).
2. **Rename-vs-create prompt** — fires on an ambiguous column change (a
   drop+add that looks like a rename). No flag bypasses it. On non-TTY
   stdin it **hangs indefinitely**, before writing any files. Only a
   timeout catches it.

Run:

```bash
timeout 30 pnpm db:migrations:create <name> --skip-empty < /dev/null
```

(No `--` separator — pnpm forwards args as-is, and a literal `--` reaches
Payload and breaks its flag parsing.) Then classify the outcome:

| Outcome | Signal | Action |
| --- | --- | --- |
| Migration created | exit 0, new `.ts` + `.json` pair | Validate (migration-validator skill), check for duplicate DDL (snapshot trap below), commit both files |
| No schema changes | exit 0, no new files, newest `.json` already has the column | Report it. Not an error |
| Silent CLI death | exit 0, no files, no output, column **absent** from the snapshot | The CLI died silently — see below. Do **not** conclude "no changes" |
| Interactive hang | exit 124, no new files | Hand the user the plain command to run interactively, then validate and commit |
| Partial write | exit 124, lone `.json` (no `.ts`) | Delete the orphaned `.json`, then hand off as above |
| Other error | exit ≥ 1 with output | Surface the error. Do not retry blindly |

### "Exit 0, no new files" is ambiguous — check the snapshot

It means either *no schema changes* or *the CLI died silently* (exit 0, zero
bytes on stdout and stderr — `payload/bin.js` runs `void start()` with no
`.catch()`). Trusting the wrong reading ships a schema change with no
migration — a prod crash-loop on boot, not a silent no-op.

Disambiguate against the newest snapshot (the schema the *next* migration
diffs against). If your new column is missing from it, no migration
captured it:

```bash
python3 -c "import json,pathlib,sys;print(sorted(json.loads(pathlib.Path(sys.argv[1]).read_text())['tables']['public.<table>']['columns']))"   "$(ls -t src/migrations/*.json | head -1)"
```

If it is absent, escalate: preload the env and redirect stdout to a file
(piping through `tail`/`grep` loses the output), and if that still shows
nothing, drive `payload.db.createMigration()` directly from `node --import
tsx/esm` with an `unhandledRejection` handler. Both worked in PR #642 where
`dangerouslyDisableSandbox` alone did not — see the
`payload-cli-dies-silently-in-sandbox` memory for the full ladder (this trap
is shared with the `payload-cli` skill).

## Running locally

```bash
pnpm payload migrate          # apply pending migrations to DATABASE_URL
pnpm payload migrate:down     # roll back the last migration
```

Never pipe through `| tail` or run in the background — you lose visibility
into progress and any interactive prompts.

## Production workflow

1. Run `pnpm db:migrations:create` locally. Commit both files.
2. On the next deploy, Railway boots the app. `prodMigrations` applies
   pending migrations before the server starts.

No separate migration step exists — build, start, and migrate happen in one
process.

## File requirements

Both files are required per migration: `.ts` (the migration logic) and
`.json` (the Drizzle schema snapshot, used for rollback). For a **data-only**
migration (no schema change), copy the previous migration's `.json` and
rename it to the new timestamp — this keeps the snapshot chain intact.

## Reviewing generated migrations

Before deploy, scan each new `.ts` against the **whole applied chain**, not
just the pending batch (see the snapshot trap below). A repeated `CREATE
TABLE`/`CREATE INDEX`/`ADD COLUMN` for schema already introduced earlier
means: stop, then trim or regenerate. `IF NOT EXISTS` only recovers from a
replay — it is not a substitute for a clean delta.

### "Unmerged" does not mean "unapplied" — Railway deploys every push

A migration is **applied somewhere** the moment its branch is pushed —
Railway runs `prodMigrations` on every PR preview's boot. So regenerating a
migration (deleting it and reissuing under a new timestamp) is safe only
**before the branch has ever deployed**.

Do it later, and the preview keeps the old migration's *columns* but no
`payload_migrations` row naming the new one — the new migration then
re-runs and fails on its first `ADD COLUMN`, crash-looping the app on boot
(#633: canonical migrations were regenerated after four pushes had already
deployed them). **A clean-database test cannot catch this** — it needs a
database that ran the *old* migration.

To reshape a migration that already deployed, pick one:

- **Reset the environment** (`railway environment delete
  SahajCloud-pr-<n> --yes`) — the next push recreates it from prod.
  Preferred: no hand-edited schema.
- **Stack a new migration** instead, and accept the add-then-change churn.

Never reach for `ADD COLUMN IF NOT EXISTS` to paper over this — it ships
weaker DDL to production for one disposable preview.

**Reading a failed preview deploy.** A Railway *project* token only sees
`production`. The CLI's own user session can read PR-environment logs
(`~/.railway/config.json` → `user.token`, against
`backboard.railway.com/graphql/v2`, `deploymentLogs(deploymentId, limit)`).
The deployment id is in the Railway check's URL on the PR.

### Never generate a migration (or types) with `E2E_TEST=true`

That flag disables several plugins, including the usage plugin (`trackUsage`
/ `resetUsage` tasks). A migration generated under it produces a schema
**missing those tasks**. The next real `migrate:create` then diffs against
the gap and emits `ALTER TYPE … ADD VALUE 'resetUsage'` for a label that has
existed since the initial schema — which throws `enum label … already
exists` and aborts the boot migration on deploy (#633).

Symptom: a generated migration adds an enum value you did not introduce.
Cross-check it against the whole chain — `grep -ln resetUsage
src/migrations/*.ts` shows where it was really created. Use a different flag
if you need to skip an unrelated check. This one corrupts the artefact you
are generating.

### `generate:types` silence means "no change," not "done"

It writes nothing when it believes the output already matches disk, so a
genuinely new field can be missing from `src/payload-types.ts` after an
apparently successful run. Force it when in doubt:

```bash
rm src/payload-types.ts && pnpm payload generate:types
```

### The out-of-order snapshot trap (duplicate re-emission)

`migrate:create` diffs against the **newest-by-filename-timestamp** `.json`
snapshot, not the last entry in `index.ts`. Migrations authored on parallel
branches can merge out of timestamp order, leaving the newest-by-timestamp
snapshot **stale** — the next `migrate:create` then re-emits DDL that is
already applied, and replaying it fails and aborts the boot migration on
deploy (#566).

- If a generated migration contains DDL you did not just cause, suspect
  this: grep the repeated table/column names across `src/migrations/*.ts`
  to find the earlier migration that already ships them.
- A freshly generated migration's snapshot reflects the full current
  schema, so once one lands with the highest timestamp, the chain heals.
- After merging parallel branches that both add migrations, verify the
  highest-timestamp snapshot contains both branches' schema before
  generating the next migration.

When adding a required relationship field to an existing table, keep the SQL
column nullable unless the migration also backfills every row before
enforcing `NOT NULL` — old rows may still be hydrating after deploy.

If a field is added and renamed before deploy, check the generated rebuild:
Drizzle can emit `SELECT new_column FROM old_table`, which fails because the
old table only has the previous name. Prefer a guarded `ALTER TABLE ...
RENAME COLUMN` for that narrow case.

## Squashing (preserve data)

When the migration chain gets painfully large, squash it (see
`DEPLOYMENT.md`). After pulling a squash commit, reset your local Postgres
so it no longer carries pre-squash `payload_migrations` rows — drop the
local database/schema and let `push` recreate it, or re-run `pnpm
db:migrate` from a clean database.

## Augmenting generated migrations

**Default: don't.** Hand-editing has repeatedly caused FK / table-rebuild
bugs (polymorphic FK renames, `_rels` rebuilds, versioned-table companion
drift). A clean post-deploy resync is cheaper than a broken migration.

Augment only when the migration fails without the edit, or the user has
explicitly asked for it. If a spec calls for a data backfill inside the
migration, surface the trade-off to the user rather than deciding it
yourself — backfills-in-migration have historically caused FK issues. A
post-deploy sync/job is often safer.

When you do edit, change only what is necessary — no defensive NULL-ing, no
cleanup the FK cascade already handles. Design features so an unpopulated
new column degrades gracefully until a follow-up job hydrates it.
