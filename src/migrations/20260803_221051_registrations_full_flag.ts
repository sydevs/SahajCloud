import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "events"    ADD COLUMN IF NOT EXISTS "registrations_full" boolean DEFAULT false;
  ALTER TABLE "_events_v" ADD COLUMN IF NOT EXISTS "version_registrations_full" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "events"    DROP COLUMN IF EXISTS "registrations_full";
  ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_registrations_full";`)
}
