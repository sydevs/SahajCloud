/**
 * Snapshot resync. Deliberately no DDL — the `.json` beside this file is the
 * whole point of the migration.
 *
 * ⚠ As generated, `up()` carried 32 statements and **every one of them was
 * already applied** by `20261106_094841_clients_one_site`: the `site_*`
 * columns, the two new enums, and the drop of `_clients_v` and `_status`. The
 * newest-by-timestamp snapshot was this branch's own
 * `20261108_220039_snapshot_resync.json`, taken before #1058 landed, so the
 * diff reads main's one-site rewrite as pending. Replaying it aborts the boot
 * migration on its first statement — the out-of-order snapshot trap, #566,
 * documented in `AGENTS.md`.
 *
 * `20261110_172159_snapshot_resync.json` was generated on the merged tree, so
 * it carries the CleverReach columns and main's one-site schema together.
 * Keeping it as the highest-timestamp snapshot, with no DDL beneath it, is
 * what heals the chain for the next `migrate:create`.
 */
export async function up(): Promise<void> {
  // No schema change.
}

export async function down(): Promise<void> {
  // Nothing to undo.
}
