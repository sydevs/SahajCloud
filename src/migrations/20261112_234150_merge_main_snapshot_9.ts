import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. The ninth `main` merge carrying a migration brought
 * `20261112_211802_drop_mailing_list_enabled`, whose snapshot was generated on
 * `main` and so knows nothing of this branch's file transcripts — while this
 * branch's own newer `20261112_213652_files_spoken_language` snapshot still
 * carries `clients.mailing_list_enabled`. `migrate:create` diffs against the
 * newest timestamp, so it re-emitted the column drop that
 * `20261112_211802_drop_mailing_list_enabled` already ships, and replaying one
 * aborts the boot migration. So the file keeps only its `.json` snapshot,
 * generated on the merged tree, which heals the chain
 * (`src/migrations/AGENTS.md`, "The out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
