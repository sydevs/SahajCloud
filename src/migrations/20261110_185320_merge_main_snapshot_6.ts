import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. The sixth `main` merge carrying a migration brought
 * `20261110_180359_merge_1075_main_snapshot_5`, whose snapshot was generated on
 * `main` and so knows nothing of the two `cleverreach` columns or the enum
 * value this branch adds. `migrate:create` diffed against it and re-emitted all
 * three statements, byte-identical to the ones
 * `20261105_233425_add_cleverreach_mailing_list` already ships — and replaying
 * one aborts the boot migration. So the file keeps only its `.json` snapshot,
 * generated on the merged tree, which heals the chain
 * (`src/migrations/AGENTS.md`, "The out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
