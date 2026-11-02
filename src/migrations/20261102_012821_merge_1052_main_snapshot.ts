import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. Merging `main` into this branch put this branch's
 * `20261030_203909_registration_refusals` behind #1059's newer
 * `20261101_191500_atlas_drop_time_in_place`, so the newest snapshot knew
 * nothing of `registration_refusals` and `migrate:create` re-emitted the whole
 * collection — the table, both `task_slug` enum values, the `managers` column
 * and the `payload_locked_documents_rels` leg. All of it ships in
 * `20261030_203909`, whose `up` also backfills every manager's preferences, so
 * replaying it would abort the boot migration on the first `CREATE TYPE`. The
 * file therefore keeps only its `.json` snapshot, generated on the merged tree,
 * which heals the chain (`src/migrations/AGENTS.md`, "The out-of-order snapshot
 * trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
