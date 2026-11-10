/**
 * Snapshot resync. Deliberately no DDL — the `.json` beside this file is the
 * whole point of the migration.
 *
 * ⚠ As generated, `up()` added `meditation_transcripts.segment_count`, which
 * `20261107_213230_transcript_segment_count` already ships. That migration
 * carries the lower timestamp, so merging it under this branch's own
 * `20261110_172159_snapshot_resync.json` left the newest snapshot without the
 * column and the diff read main's #1087 work as pending. Replaying it aborts
 * the boot migration on its first statement — the out-of-order snapshot trap,
 * #566, documented in `AGENTS.md`.
 *
 * `20261110_175935_snapshot_resync.json` was generated on the merged tree, so
 * it carries the CleverReach columns and main's segment count together.
 * Keeping it as the highest-timestamp snapshot, with no DDL beneath it, is
 * what heals the chain for the next `migrate:create`.
 */
export async function up(): Promise<void> {
  // No schema change.
}

export async function down(): Promise<void> {
  // Nothing to undo.
}
