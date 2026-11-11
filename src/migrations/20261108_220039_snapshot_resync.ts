/**
 * Snapshot resync. Deliberately no DDL — the `.json` beside this file is the
 * whole point of the migration.
 *
 * ⚠ As generated, `up()` carried five statements and **every one of them was
 * already applied** by `20261105_233425_add_cleverreach_mailing_list`: the
 * `cleverreach` enum value and the two `mailing_list_*` columns on `clients`
 * and `_clients_v`. `migrate:create` diffs against the newest-by-timestamp
 * snapshot, and `20261107_225000_atlas_clock_copy.json` re-stamps a snapshot
 * taken on `main` before this branch existed. Replaying them aborts the boot
 * migration on its first statement — the out-of-order snapshot trap, #566,
 * documented in `AGENTS.md`.
 *
 * `20261108_220039_snapshot_resync.json` was generated on the merged tree, so
 * it carries both the CleverReach columns and `main`'s 20261105–20261107
 * schema. Keeping it as the highest-timestamp snapshot, with no DDL beneath
 * it, is what heals the chain for the next `migrate:create`. Do not regenerate
 * this file: with the same stale predecessor it re-emits the same duplicates.
 */
export async function up(): Promise<void> {
  // No schema change.
}

export async function down(): Promise<void> {
  // Nothing to undo.
}
