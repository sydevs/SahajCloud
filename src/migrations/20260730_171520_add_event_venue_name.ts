import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" ADD COLUMN "address_venue_name" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_address_venue_name" varchar;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "event_title" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_event_title" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" DROP COLUMN "address_venue_name";
  ALTER TABLE "_events_v" DROP COLUMN "version_address_venue_name";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "event_title";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_event_title";`)
}
