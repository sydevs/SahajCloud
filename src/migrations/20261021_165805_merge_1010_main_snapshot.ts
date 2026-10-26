import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. Merging `main` into this branch put #1010's
 * `20261021_014535_localize_app_card_destination` behind this branch's newer
 * `20261021_152406`, so the newest snapshot lacked the three localized
 * `app_cards` destination columns and `migrate:create` re-emitted all six
 * `ADD COLUMN`s and all six `DROP COLUMN`s. Every one already ships in
 * `20261021_014535`, which also backfills English between the two halves —
 * replaying this would drop the base columns a second time with nothing to
 * carry. So the file keeps only its `.json` snapshot, generated on the merged
 * tree, which heals the chain (`src/migrations/AGENTS.md`, "The out-of-order
 * snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
