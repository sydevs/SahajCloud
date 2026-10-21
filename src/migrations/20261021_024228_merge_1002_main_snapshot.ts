import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. Merging `main` into #1001's branch put main's
 * `20261020_170450_localize_admin_edited_fields` behind this branch's newer
 * `20261021_014535`, so the newest snapshot lacked every column #1002 moved and
 * `migrate:create` re-emitted all of them. Every statement it emitted — the six
 * `app_cards` / `_app_cards_v` meditation columns and their constraints and
 * indexes, `videos.subtitles`, `forms_blocks_select.placeholder`, `forms.title`
 * and `forms.redirect_url`, each into its `_locales` twin — already ships in
 * `20261020_170450` and `20261020_185917`, so this file keeps only its `.json`
 * snapshot, generated on the merged tree, which heals the chain
 * (`src/migrations/AGENTS.md`, "The out-of-order snapshot trap").
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
