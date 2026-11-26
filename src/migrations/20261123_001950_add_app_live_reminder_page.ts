import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_app_config" ADD COLUMN "live_meditations_reminder_page_id" integer;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_live_meditations_reminder_page_id_pages_id_fk" FOREIGN KEY ("live_meditations_reminder_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "wm_app_config_live_meditations_reminder_page_idx" ON "wm_app_config" USING btree ("live_meditations_reminder_page_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_app_config" DROP CONSTRAINT "wm_app_config_live_meditations_reminder_page_id_pages_id_fk";
  
  DROP INDEX "wm_app_config_live_meditations_reminder_page_idx";
  ALTER TABLE "wm_app_config" DROP COLUMN "live_meditations_reminder_page_id";`)
}
