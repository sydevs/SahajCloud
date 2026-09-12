import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" DROP COLUMN "common";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "page_tags";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "errors";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_common";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_page_tags";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_errors";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" ADD COLUMN "common" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "page_tags" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "errors" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_common" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_page_tags" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_errors" jsonb;`)
}
