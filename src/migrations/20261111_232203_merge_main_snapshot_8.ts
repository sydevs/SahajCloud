import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. The eighth `main` merge carrying a migration brought
 * `20261111_215539_activity_log_rows`, whose snapshot was generated on `main`
 * and so knows nothing of the `recoverLostJobs` task slug this branch adds — and
 * its timestamp is newer, so `migrate:create` diffed against it and re-emitted
 * both `ADD VALUE` statements. `20261111_182607_recover_lost_jobs_task` already
 * ships them, and replaying one aborts the boot migration. So the file keeps
 * only its `.json` snapshot, generated on the merged tree, which heals the chain
 * (`src/migrations/AGENTS.md`, "The out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
