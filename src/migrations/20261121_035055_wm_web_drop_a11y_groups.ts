import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// WeMeditate Web's ten "a11y" sub-groups go: the strings only a screen reader speaks now live in
// the site itself (sydevs/WeMeditateWeb lib/i18n/a11y/), machine-translated there, and the site
// mounts its own copy over anything this global still serves.
//
// ⚠ **The stored values are discarded, and nothing restores them.** Dropping a column takes its
// values with it, and the down migration re-adds the columns empty. Nothing reads them any more.
//
// Whole groups, so this is generated DDL and not the JSONB key-retirement trap in
// src/globals/AGENTS.md: with the columns gone, no undeclared key remains to refuse a save.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" DROP COLUMN "common_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "errors_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "article_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "meditation_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "lecture_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "map_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "forms_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "media_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "location_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "blocks_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_common_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_errors_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_article_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_meditation_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_lecture_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_map_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_forms_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_media_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_location_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_blocks_a11y";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" ADD COLUMN "common_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "errors_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "article_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "meditation_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "lecture_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "map_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "forms_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "media_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "location_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "blocks_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_common_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_errors_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_article_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_meditation_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_lecture_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_map_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_forms_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_media_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_location_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_blocks_a11y" jsonb;`)
}
