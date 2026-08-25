import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "registrations" ADD COLUMN "activity_log" jsonb;
  ALTER TABLE "registrations" DROP COLUMN "reminder_log";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "registrations" ADD COLUMN "reminder_log" jsonb;
  ALTER TABLE "registrations" DROP COLUMN "activity_log";`)
}
