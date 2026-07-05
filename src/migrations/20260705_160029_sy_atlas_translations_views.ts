import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "region_locations" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "region_venues" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "event_details" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "event_recurrence" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "event_timing" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "registration_form" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "registration_errors" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "registration_questions" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "share" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_region_locations" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_region_venues" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_event_details" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_event_recurrence" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_event_timing" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_registration_form" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_registration_errors" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_registration_questions" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_share" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "map";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "location";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "event";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_map";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_location";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_event";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "map" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "location" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "event" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_map" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_location" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_event" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "region_locations";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "region_venues";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "event_details";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "event_recurrence";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "event_timing";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "registration_form";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "registration_errors";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "registration_questions";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "share";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_region_locations";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_region_venues";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_event_details";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_event_recurrence";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_event_timing";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_registration_form";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_registration_errors";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_registration_questions";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_share";`)
}
