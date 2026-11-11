import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. The eighth `main` merge carrying a migration brought
 * `20261110_234836_clients_label_title`, whose snapshot was generated on `main`
 * and so still has `intro_audio_id` and `intro_subtitles` on `lessons` rather
 * than on `lessons_locales`. Being the newest by filename, it is what
 * `migrate:create` diffs against — so the run re-emitted all eight statements
 * that `20261110_185146_localize_lesson_intro_audio_and_subtitles` already
 * ships, byte-identical, and replaying one aborts the boot migration. This file
 * therefore keeps only its `.json` snapshot, generated on the merged tree,
 * which heals the chain (`src/migrations/AGENTS.md`, "The out-of-order snapshot
 * trap").
 *
 * ⚠ **It carries none of that migration's backfill either**, which is the point:
 * the data move happens once, there. A copy here would run the upsert a second
 * time against rows the first pass already moved.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
