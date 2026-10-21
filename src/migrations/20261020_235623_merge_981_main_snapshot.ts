import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. The second merge of `main` into #981's branch put
 * main's event-import migrations behind this branch's newer ones, so the
 * newest snapshot (`20261020_185917`) lacked the `imports` tables and
 * `migrate:create` re-emitted all of them. Every statement it emitted —
 * `imports` and `imports_default_languages`, `events.import_batch_id` and its
 * version twin, the `sweepEventImports` and `importEvents` job slugs, and
 * `imports.results` — already ships in `20261010_013059`, `20261010_025807`,
 * `20261017_161838`, `20261019_182311`, `20261020_002253` and
 * `20261020_172522`, so this file keeps only its `.json` snapshot, generated
 * on the merged tree, which heals the chain (`src/migrations/AGENTS.md`, "The
 * out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
