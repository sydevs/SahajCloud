import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_registration_notification_frequency" AS ENUM('Immediate', 'Never');
  ALTER TABLE "events" ADD COLUMN "registration_notification_email" varchar;
  ALTER TABLE "events" ADD COLUMN "registration_notification_frequency" "enum_events_registration_notification_frequency" DEFAULT 'Immediate';
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_notification_email" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_notification_frequency" "enum_events_registration_notification_frequency" DEFAULT 'Immediate';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" DROP COLUMN "registration_notification_email";
  ALTER TABLE "events" DROP COLUMN "registration_notification_frequency";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_notification_email";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_notification_frequency";
  DROP TYPE "public"."enum_events_registration_notification_frequency";`)
}
