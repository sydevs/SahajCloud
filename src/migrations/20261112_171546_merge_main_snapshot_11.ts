import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * No DDL: `20261111_182607_recover_lost_jobs_task` already adds `recoverLostJobs`
 * to both task-slug enums, and this branch's own snapshots were generated before
 * it. The `.json` beside this file is what the chain needs — it is the first
 * snapshot taken on the merged tree, so the next `migrate:create` diffs against
 * both branches' schema rather than re-emitting that enum value a third time.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {}
