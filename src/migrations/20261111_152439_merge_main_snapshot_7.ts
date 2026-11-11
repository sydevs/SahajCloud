import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. The seventh `main` merge carrying a migration brought
 * `20261110_234836_clients_label_title`, whose snapshot was generated on `main`
 * and so knows nothing of the `last_login_at` column this branch adds — and its
 * timestamp is newer, so `migrate:create` diffed against it and re-emitted that
 * column. `20261110_220603_manager_last_login` already ships it, and replaying
 * one statement aborts the boot migration. So the file keeps only its `.json`
 * snapshot, generated on the merged tree, which heals the chain
 * (`src/migrations/AGENTS.md`, "The out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
