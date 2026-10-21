import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. Merging `main` into #987's branch put main's #981
 * localization migrations behind this branch's newer one, so the
 * newest-by-timestamp snapshot (`20261021_020011`) still held the pre-#981
 * schema and `migrate:create` re-emitted the whole move. Every statement it
 * emitted — `videos.subtitles`, the three `app-cards` meditation targets and
 * their version twins, `forms.title`, `forms.redirect.url` and the `select`
 * block's `placeholder`, each into its `_locales` table — already ships in
 * `20261020_170450`, with the `forms_locales.title` constraint in
 * `20261020_185917`. So this file keeps only its `.json` snapshot, generated on
 * the merged tree, which heals the chain (`src/migrations/AGENTS.md`, "The
 * out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
