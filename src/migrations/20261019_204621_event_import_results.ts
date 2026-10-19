import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "imports" ADD COLUMN "error" varchar;
  ALTER TABLE "imports" ADD COLUMN "results" jsonb;
  ALTER TABLE "imports" DROP COLUMN "skipped_rows";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "imports" ADD COLUMN "skipped_rows" jsonb;
  ALTER TABLE "imports" DROP COLUMN "error";
  ALTER TABLE "imports" DROP COLUMN "results";`)
}
