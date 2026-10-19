import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "imports" ALTER COLUMN "manager_id" DROP NOT NULL;
  ALTER TABLE "imports" ADD COLUMN "error" varchar;
  ALTER TABLE "imports" ADD COLUMN "results" jsonb;
  ALTER TABLE "imports" DROP COLUMN "skipped_rows";
  ALTER TABLE "imports" DROP COLUMN "summary_imported";
  ALTER TABLE "imports" DROP COLUMN "summary_updated";
  ALTER TABLE "imports" DROP COLUMN "summary_total";
  ALTER TABLE "imports" DROP COLUMN "summary_issues";
  ALTER TABLE "imports" DROP COLUMN "summary_issue_details";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "imports" ALTER COLUMN "manager_id" SET NOT NULL;
  ALTER TABLE "imports" ADD COLUMN "skipped_rows" jsonb;
  ALTER TABLE "imports" ADD COLUMN "summary_imported" numeric;
  ALTER TABLE "imports" ADD COLUMN "summary_updated" numeric;
  ALTER TABLE "imports" ADD COLUMN "summary_total" numeric;
  ALTER TABLE "imports" ADD COLUMN "summary_issues" numeric;
  ALTER TABLE "imports" ADD COLUMN "summary_issue_details" jsonb;
  ALTER TABLE "imports" DROP COLUMN "error";
  ALTER TABLE "imports" DROP COLUMN "results";`)
}
