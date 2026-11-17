import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. The tenth `main` merge carrying a migration brought
 * `20261115_184420_payload_3_92` and its 32 locale `_parent_id` indexes, whose
 * snapshot knows nothing of this branch's storage `prefix` column — while this
 * branch's own newer `20261116_171937_storage_prefix` snapshot predates the
 * 3.92 bump. `migrate:create` diffs against the newest timestamp, so it
 * re-emitted all 32 `CREATE INDEX` statements that
 * `20261115_184420_payload_3_92` already ships, and replaying one aborts the
 * boot migration. So the file keeps only its `.json` snapshot, generated on the
 * merged tree, which heals the chain (`src/migrations/AGENTS.md`, "The
 * out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
