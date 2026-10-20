import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. Merging `main` into #907's branch put main's
 * `20261017_093546_localize_lesson_title_and_panels` behind this branch's
 * newer migrations, so the newest snapshot (`20261020_172522`) lacked the
 * lesson localization and `migrate:create` re-emitted it. Every statement it
 * emitted — `lessons_panels._locale`, `lessons_locales.title`,
 * `lessons_panels_locale_idx`, and dropping `lessons.title` — already ships in
 * that migration, so this file keeps only its `.json` snapshot, generated on
 * the merged tree, which heals the chain (`src/migrations/AGENTS.md`, "The
 * out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
