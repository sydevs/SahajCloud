import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "app_cards" ADD COLUMN "schedule_last_date" timestamp(3) with time zone;
  ALTER TABLE "_app_cards_v" ADD COLUMN "version_schedule_last_date" timestamp(3) with time zone;
  ALTER TABLE "events" ADD COLUMN "schedule_last_date" timestamp(3) with time zone;
  ALTER TABLE "_events_v" ADD COLUMN "version_schedule_last_date" timestamp(3) with time zone;
  CREATE INDEX "app_cards_schedule_schedule_last_date_idx" ON "app_cards" USING btree ("schedule_last_date");
  CREATE INDEX "_app_cards_v_version_schedule_version_schedule_last_date_idx" ON "_app_cards_v" USING btree ("version_schedule_last_date");
  CREATE INDEX "events_schedule_schedule_last_date_idx" ON "events" USING btree ("schedule_last_date");
  CREATE INDEX "_events_v_version_schedule_version_schedule_last_date_idx" ON "_events_v" USING btree ("version_schedule_last_date");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "app_cards_schedule_schedule_last_date_idx";
  DROP INDEX "_app_cards_v_version_schedule_version_schedule_last_date_idx";
  DROP INDEX "events_schedule_schedule_last_date_idx";
  DROP INDEX "_events_v_version_schedule_version_schedule_last_date_idx";
  ALTER TABLE "app_cards" DROP COLUMN "schedule_last_date";
  ALTER TABLE "_app_cards_v" DROP COLUMN "version_schedule_last_date";
  ALTER TABLE "events" DROP COLUMN "schedule_last_date";
  ALTER TABLE "_events_v" DROP COLUMN "version_schedule_last_date";`)
}
