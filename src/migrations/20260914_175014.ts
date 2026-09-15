/**
 * Snapshot resync. Deliberately no DDL — the `.json` beside this file is the
 * whole point of the migration.
 *
 * ⚠ As generated, `up()` carried 142 statements and **every one of them was
 * already applied** by an earlier migration in this chain: `20260705_160029`,
 * `20260705_161112`, `20260909_161243`, `20260909_161353`, `20260909_161848`,
 * `20260909_162104`, `20260911_235823`, `20260912_031449`, `20260913_212558`.
 * Nothing in it was new. `migrate:create` diffs against the
 * newest-by-timestamp snapshot, and `20260914_172100_user_submissions.json`
 * was generated before `main` was merged in, so the diff re-emitted all of
 * `main`'s 20260909–20260913 schema. Replaying it aborts the boot migration on
 * its first statement (`CREATE TYPE … already exists`) — the out-of-order
 * snapshot trap, #566, documented in `AGENTS.md`.
 *
 * `20260914_175014.json` was generated on the merged tree, so it carries both
 * `user_submissions` and `main`'s schema. Keeping it as the highest-timestamp
 * snapshot, with no DDL beneath it, is what heals the chain for the next
 * `migrate:create`.
 *
 * Do not regenerate this file: with the same stale predecessor it re-emits the
 * same duplicates. And note `push: !isProduction` in `src/payload.config.ts` —
 * dev and CI sync the schema with Drizzle push and never replay this chain, so
 * a green CI run says nothing about it. Only a Railway boot does.
 */
export async function up(): Promise<void> {
  // No schema change.
}

export async function down(): Promise<void> {
  // Nothing to undo.
}
