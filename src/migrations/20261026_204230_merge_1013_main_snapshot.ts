import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. Merging `main` into this branch put #1013's
 * `20261021_152406_retention_registry` behind this branch's newer
 * `20261025_195340_clients_language_rename`, so the newest snapshot still named
 * the three replaced task slugs and `migrate:create` re-emitted both
 * `task_slug` enum rebuilds. Both already ship in `20261021_152406`, which
 * **deletes** the rows naming the dropped slugs before it casts — the
 * re-emission does not, so replaying it would abort the boot migration on the
 * first legacy row. So the file keeps only its `.json` snapshot, generated on
 * the merged tree, which heals the chain (`src/migrations/AGENTS.md`, "The
 * out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
