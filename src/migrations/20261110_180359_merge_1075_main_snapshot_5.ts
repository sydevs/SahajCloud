import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. The fifth `main` merge carrying a migration brought
 * `20261107_213230_transcript_segment_count`, whose timestamp is older than the
 * newest snapshot on this branch — so `migrate:create` diffed against a
 * snapshot that knew nothing of `segment_count` and re-emitted the column.
 * `20261107_213230` already ships it, and replaying one statement aborts the
 * boot migration. So the file keeps only its `.json` snapshot, generated on the
 * merged tree, which heals the chain (`src/migrations/AGENTS.md`, "The
 * out-of-order snapshot trap").
 *
 * This is the only such heal left on the branch: an earlier one heals the chain
 * as it stood and is superseded the moment a newer snapshot lands, so every one
 * before this was dropped rather than kept.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
