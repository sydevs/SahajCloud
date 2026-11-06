import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. Merging `main` into this branch put #1074's
 * `20261102_213524_derive_atlas_roles` and the `user_submissions` routing-region
 * pair (`20261104_180154_routing_region`, `20261105_181908_retire_region_hint`)
 * behind this branch's newer clients migrations, so the newest snapshot predated
 * them and `migrate:create` re-emitted all three. They already ship in those
 * files. So this file keeps only its `.json` snapshot, generated on the merged
 * tree, which heals the chain (`src/migrations/AGENTS.md`, "The out-of-order
 * snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
