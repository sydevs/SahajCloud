import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. The third `main` merge carrying a migration put this
 * branch's `20261102_225511_rename_transcripts` behind
 * `20261107_225000_atlas_clock_copy`, so the newest snapshot named
 * `meditation_transcripts` again and `migrate:create` re-emitted the whole
 * rename as a fresh `CREATE TABLE "transcripts"` plus `DROP TABLE
 * "meditation_transcripts" CASCADE`. `20261102_225511` already ships every one
 * of those objects, by **rename** — it carries all 122 rows across, which the
 * re-emission would instead destroy. So the file keeps only its `.json`
 * snapshot, generated on the merged tree, which heals the chain
 * (`src/migrations/AGENTS.md`, "The out-of-order snapshot trap").
 *
 * `20261104_182008_merge_1075_main_snapshot` and
 * `20261107_220312_merge_1075_main_snapshot_2` are the same heal for the first
 * two such merges. Each one heals only the chain as it stood, so a later merge
 * bringing migrations of its own needs another.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
