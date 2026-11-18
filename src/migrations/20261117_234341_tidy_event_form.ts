/**
 * Hand-augmented: the two new columns carry data derived from the ones this
 * migration drops, so each backfill runs while its source still exists.
 * `repeats` replaces the stored `inactive` flag and takes over the schedule's
 * own recurrence, and `allow_contact` gates the three contact fields, which
 * were unconditional before.
 *
 * ⚠ The contact backfill names all three columns, so the box ends up on exactly
 * where a contact detail is stored. A row with only a name would otherwise read
 * as offering no contact while still holding one.
 *
 * The down migration is schema-faithful, not data-faithful: it restores the two
 * notification columns at their defaults, since `up` drops the values.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_repeats" AS ENUM('once', 'daily', 'weekly', 'monthly', 'inactive');
  ALTER TABLE "events" ADD COLUMN "allow_contact" boolean DEFAULT false;
  ALTER TABLE "events" ADD COLUMN "repeats" "enum_events_repeats" DEFAULT 'once';
  ALTER TABLE "_events_v" ADD COLUMN "version_allow_contact" boolean DEFAULT false;
  ALTER TABLE "_events_v" ADD COLUMN "version_repeats" "enum_events_repeats" DEFAULT 'once';
  UPDATE "events" SET "repeats" = (CASE
    WHEN "inactive" THEN 'inactive'
    WHEN "schedule_recurrence_type" IS NOT NULL THEN lower("schedule_recurrence_type"::text)
    ELSE 'once'
  END)::"public"."enum_events_repeats";
  UPDATE "_events_v" SET "version_repeats" = (CASE
    WHEN "version_inactive" THEN 'inactive'
    WHEN "version_schedule_recurrence_type" IS NOT NULL THEN lower("version_schedule_recurrence_type"::text)
    ELSE 'once'
  END)::"public"."enum_events_repeats";
  UPDATE "events" SET "allow_contact" = true
    WHERE "contact_phone" IS NOT NULL OR "contact_email" IS NOT NULL
      OR "contact_name" IS NOT NULL;
  UPDATE "_events_v" SET "version_allow_contact" = true
    WHERE "version_contact_phone" IS NOT NULL OR "version_contact_email" IS NOT NULL
      OR "version_contact_name" IS NOT NULL;
  ALTER TABLE "events" DROP COLUMN "inactive";
  ALTER TABLE "events" DROP COLUMN "registration_notification_email";
  ALTER TABLE "events" DROP COLUMN "registration_notification_frequency";
  ALTER TABLE "_events_v" DROP COLUMN "version_inactive";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_notification_email";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_notification_frequency";
  DROP TYPE "public"."enum_events_registration_notification_frequency";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_registration_notification_frequency" AS ENUM('Immediate', 'Never');
  ALTER TABLE "events" ADD COLUMN "inactive" boolean DEFAULT false;
  ALTER TABLE "events" ADD COLUMN "registration_notification_email" varchar;
  ALTER TABLE "events" ADD COLUMN "registration_notification_frequency" "enum_events_registration_notification_frequency" DEFAULT 'Immediate';
  ALTER TABLE "_events_v" ADD COLUMN "version_inactive" boolean DEFAULT false;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_notification_email" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_notification_frequency" "enum_events_registration_notification_frequency" DEFAULT 'Immediate';
  UPDATE "events" SET "inactive" = ("repeats" = 'inactive');
  UPDATE "_events_v" SET "version_inactive" = ("version_repeats" = 'inactive');
  ALTER TABLE "events" DROP COLUMN "allow_contact";
  ALTER TABLE "events" DROP COLUMN "repeats";
  ALTER TABLE "_events_v" DROP COLUMN "version_allow_contact";
  ALTER TABLE "_events_v" DROP COLUMN "version_repeats";
  DROP TYPE "public"."enum_events_repeats";`)
}
