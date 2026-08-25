import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Hand-edited from the generated drop+add, which would have discarded every
  // verification cycle on every event — drizzle can't tell a rename from a new
  // column, and this column is populated for essentially all of them (the Atlas
  // import seeds an entry, and each verification writes one). A rename keeps it.
  await db.execute(sql`
   ALTER TABLE "events" RENAME COLUMN "notification_log" TO "activity_log";
  ALTER TABLE "_events_v" RENAME COLUMN "version_notification_log" TO "version_activity_log";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" RENAME COLUMN "activity_log" TO "notification_log";
  ALTER TABLE "_events_v" RENAME COLUMN "version_activity_log" TO "version_notification_log";`)
}
