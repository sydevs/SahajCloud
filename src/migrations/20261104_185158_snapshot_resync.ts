/**
 * Snapshot resync. Deliberately no DDL — the `.json` beside this file is the
 * whole point of the migration.
 *
 * ⚠ As generated, `up()` carried four statements and **every one of them was
 * already applied** by `main`'s two migrations: `users.blocked_at` and
 * `users.blocked_reason` by `20261101_202242_block_submitter`, and the
 * `user_submissions.sender_email` drop (with its index) by
 * `20261103_215150_submitter_identity`. `migrate:create` diffs against the
 * newest-by-timestamp snapshot, and `20261104_180154_routing_region.json` was
 * generated before `main` was merged in. Replaying them aborts the boot
 * migration on its first statement — the out-of-order snapshot trap, #566,
 * documented in `AGENTS.md`.
 *
 * `20261104_185158_snapshot_resync.json` was generated on the merged tree, so
 * it carries both branches' schema. Keeping it as the highest-timestamp
 * snapshot, with no DDL beneath it, is what heals the chain for the next
 * `migrate:create`. Do not regenerate this file: with the same stale
 * predecessor it re-emits the same duplicates.
 */
export async function up(): Promise<void> {
  // No schema change.
}

export async function down(): Promise<void> {
  // Nothing to undo.
}
