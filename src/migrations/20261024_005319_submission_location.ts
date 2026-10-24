import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_submissions" ADD COLUMN "location" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "submit_chrome" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "submit_where" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "submit_when" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "submit_contact" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "submit_about" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "submit_more" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "submit_review" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "submit_done" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "submit_errors" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_submit_chrome" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_submit_where" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_submit_when" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_submit_contact" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_submit_about" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_submit_more" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_submit_review" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_submit_done" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_submit_errors" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_submissions" DROP COLUMN "location";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "submit_chrome";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "submit_where";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "submit_when";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "submit_contact";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "submit_about";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "submit_more";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "submit_review";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "submit_done";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "submit_errors";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_submit_chrome";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_submit_where";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_submit_when";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_submit_contact";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_submit_about";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_submit_more";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_submit_review";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_submit_done";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_submit_errors";`)
}
