import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "managers" DROP COLUMN "login_attempts";
  ALTER TABLE "managers" DROP COLUMN "lock_until";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "managers" ADD COLUMN "login_attempts" numeric DEFAULT 0;
  ALTER TABLE "managers" ADD COLUMN "lock_until" timestamp(3) with time zone;`)
}
