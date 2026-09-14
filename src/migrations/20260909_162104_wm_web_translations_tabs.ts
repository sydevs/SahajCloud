import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" ADD COLUMN "common_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "common_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "errors_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "errors_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "article_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "article_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "meditation_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "meditation_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "lecture_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "lecture_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "map_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "map_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "forms_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "forms_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "media_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "media_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "location_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "location_a11y" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "blocks_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "blocks_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_common_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_common_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_errors_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_errors_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_article_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_article_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_meditation_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_meditation_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_lecture_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_lecture_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_map_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_map_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_forms_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_forms_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_media_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_media_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_location_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_location_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_blocks_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_blocks_a11y" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" DROP COLUMN "common_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "common_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "errors_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "errors_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "article_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "article_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "meditation_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "meditation_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "lecture_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "lecture_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "map_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "map_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "forms_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "forms_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "media_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "media_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "location_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "location_a11y";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "blocks_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "blocks_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_common_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_common_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_errors_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_errors_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_article_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_article_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_meditation_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_meditation_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_lecture_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_lecture_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_map_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_map_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_forms_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_forms_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_media_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_media_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_location_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_location_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_blocks_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_blocks_a11y";`)
}
