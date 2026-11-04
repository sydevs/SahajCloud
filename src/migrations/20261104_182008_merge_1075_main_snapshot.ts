import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. Merging `main` into this branch put this branch's
 * `20261102_225511_rename_transcripts` behind `main`'s newer
 * `20261103_215150_submitter_identity`, so the newest snapshot still named
 * `meditation_transcripts` and `migrate:create` re-emitted the whole rename as
 * a fresh `CREATE TABLE "transcripts"` plus `DROP TABLE
 * "meditation_transcripts" CASCADE`. `20261102_225511` already ships every one
 * of those objects, by **rename** — it carries all 122 rows across, which the
 * re-emission would instead destroy. So the file keeps only its `.json`
 * snapshot, generated on the merged tree, which heals the chain
 * (`src/migrations/AGENTS.md`, "The out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
