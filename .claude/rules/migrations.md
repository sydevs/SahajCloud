---
paths:
  - src/migrations/**/*.ts
  - src/migrations/**/*.json
---

# Database Migrations

Local dev uses migrations, **not push-sync**. The D1 adapter is configured with
`push: false` in `src/payload.config.ts`, so the local dev DB is shaped by the
same migration files that run in production. Drizzle's push mode silently
skips some SQLite ALTER TABLE rebuilds (notably polymorphic-FK renames),
which caused an invisible dev/prod drift in PR #292. **Never flip this back
to push mode.**

## First-time dev setup (or after `pnpm reset --local`)

Run `pnpm payload migrate` before the dev server can boot. The server doesn't
auto-apply migrations on start.

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

## Squashing (preserve data)

When the chain gets painfully large, use `./seeds/squash-migrations.sh` —
see DEPLOYMENT.md "Squashing Migrations" section. **After pulling a squash
commit, run `pnpm reset --local && pnpm payload migrate`** — without the
reset, your local `.wrangler` DB still has pre-squash `payload_migrations`
rows and future migrations behave inconsistently.

## Known Drizzle bug — polymorphic relationship rename

When a polymorphic relationship's `relationTo` changes (e.g. `'lectures'` →
`'lecture-clips'`), Drizzle emits a table rebuild like:

```sql
INSERT INTO __new_foo_rels(..., "lecture_clips_id", ...)
SELECT ..., "lecture_clips_id", ... FROM foo_rels;
```

The old `foo_rels` only has `lectures_id`, so SQLite throws
`no such column: lecture_clips_id`. Fix by dropping the new column from
both sides of the INSERT/SELECT (the typical "don't rewrite polymorphic
FKs" decision). Scan generated `_rels` rebuilds for this whenever you
rename a polymorphic relationTo.

## Known D1 bug — `PRAGMA foreign_keys=OFF` doesn't span `db.run()` calls

Each `db.run()` is a fresh statement context in Cloudflare D1, so
`PRAGMA foreign_keys=OFF` does **not** carry over to the next call.
The PRAGMA wrappers that Drizzle emits around table rebuilds give a
false sense of safety.

### The dangerous pattern

When a generated migration recreates a *child* table (versions table,
`_rels` table, etc.) **before** dropping its *parent* — which is the
order Drizzle codegen typically emits — the parent's `DROP TABLE`
fires the child's `ON DELETE set null` / `cascade` action on the
freshly-rebuilt rows. The PRAGMA wrapping the child's block is no
longer in scope.

Recognize the pattern by these markers, all in the same migration:

```sql
-- Child rebuild block (e.g. _foo_v)
CREATE TABLE `__new__foo_v` (..., FOREIGN KEY (`parent_id`) REFERENCES `foo`(`id`) ON DELETE set null);
INSERT INTO `__new__foo_v`(...) SELECT ... FROM `_foo_v`;
DROP TABLE `_foo_v`;
ALTER TABLE `__new__foo_v` RENAME TO `_foo_v`;

-- Parent rebuild block (e.g. foo) — fires the cascade
CREATE TABLE `__new_foo` (...);
INSERT INTO `__new_foo`(...) SELECT ... FROM `foo`;
DROP TABLE `foo`;     -- ← nulls _foo_v.parent_id on D1
ALTER TABLE `__new_foo` RENAME TO `foo`;
```

### Mitigation when augmenting

Pick whichever applies:

1. **Reorder** so the parent rebuild runs *before* the child rebuild.
2. **Avoid the rebuild entirely** — most schema changes can be expressed
   with `ALTER TABLE ADD COLUMN` instead of a full table rebuild.
3. **NULL + restore** the child's FK column around the parent drop in
   the same `db.run()` boundary as the cascade-triggering statement.

### Recovery if a broken migration has already shipped

Editing the original migration won't help — Payload tracks migrations
by name in `payload_migrations` and won't re-run them. Write a new
data-only migration that backfills the corrupted FKs. The recovery
template (see `src/migrations/20260525_212416.ts`) is a three-pass
`version_label`-based backfill: unique matches → ambiguous-pair
matching via `ROW_NUMBER() OVER (PARTITION BY ...)` → DELETE
unrecoverable orphans.

References: #402 (the fix), #401 (the offending migration). This trap
has bitten this project repeatedly; treat any generated migration that
rebuilds two related tables in sequence as requiring a manual review
before merge.

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
