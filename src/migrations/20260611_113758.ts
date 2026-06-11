import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "events_next_check_at_idx" ON "events" USING btree ("next_check_at");
  CREATE INDEX "_events_v_version_version_next_check_at_idx" ON "_events_v" USING btree ("version_next_check_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "events_next_check_at_idx";
  DROP INDEX "_events_v_version_version_next_check_at_idx";`)
}
