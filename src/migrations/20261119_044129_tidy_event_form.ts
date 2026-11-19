/**
 * Hand-augmented: `allow_contact` gates the three contact fields, which were
 * unconditional before, so it is backfilled on wherever a contact is stored.
 *
 * ⚠ The backfill reads the phone and the email and not the name, and counts a
 * blank as absent, which is the gate `hasContactRoute` applies: a name alone
 * reaches nobody. A row carrying only a name keeps it, unread, until the row's
 * next save empties it.
 *
 * The down migration is schema-faithful, not data-faithful: it restores the two
 * notification columns at their defaults, since up drops the values.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" ADD COLUMN "allow_contact" boolean DEFAULT false;
  ALTER TABLE "_events_v" ADD COLUMN "version_allow_contact" boolean DEFAULT false;
  UPDATE "events" SET "allow_contact" = true WHERE COALESCE("contact_phone", '') <> '' OR COALESCE("contact_email", '') <> '';
  UPDATE "_events_v" SET "version_allow_contact" = true WHERE COALESCE("version_contact_phone", '') <> '' OR COALESCE("version_contact_email", '') <> '';
  ALTER TABLE "events" DROP COLUMN "registration_notification_email";
  ALTER TABLE "events" DROP COLUMN "registration_notification_frequency";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_notification_email";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_notification_frequency";
  DROP TYPE "public"."enum_events_registration_notification_frequency";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_registration_notification_frequency" AS ENUM('Immediate', 'Never');
  ALTER TABLE "events" ADD COLUMN "registration_notification_email" varchar;
  ALTER TABLE "events" ADD COLUMN "registration_notification_frequency" "enum_events_registration_notification_frequency" DEFAULT 'Immediate';
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_notification_email" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_notification_frequency" "enum_events_registration_notification_frequency" DEFAULT 'Immediate';
  ALTER TABLE "events" DROP COLUMN "allow_contact";
  ALTER TABLE "_events_v" DROP COLUMN "version_allow_contact";`)
}
