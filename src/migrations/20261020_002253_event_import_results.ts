import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The class import's own columns on the plugin's `imports` table: `results`
 * and `error`, the dropped `summary` group and `skipped_rows`, nullable
 * target and uploader, and the status vocabulary of pending, review,
 * completed and failed.
 *
 * ⚠ Hand-edited: the generator casts the status column straight to the new
 * enum, which a stored 'partial' would fail. The `UPDATE` maps the old values
 * first, by whether the import still has drafts.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "imports" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "imports" ALTER COLUMN "status" SET DEFAULT 'pending'::text;
  -- The plugin's 'partial' and 'completed' recorded how a run went; the new
  -- 'review' and 'completed' say whether any of its drafts are left.
  UPDATE "imports" SET "status" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "events" e WHERE e."import_batch_id" = "imports"."id" AND e."_status" = 'draft'
    ) THEN 'review' ELSE 'completed' END
  WHERE "status" IN ('partial', 'completed');
  DROP TYPE "public"."enum_imports_status";
  CREATE TYPE "public"."enum_imports_status" AS ENUM('pending', 'review', 'completed', 'failed');
  ALTER TABLE "imports" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."enum_imports_status";
  ALTER TABLE "imports" ALTER COLUMN "status" SET DATA TYPE "public"."enum_imports_status" USING "status"::"public"."enum_imports_status";
  ALTER TABLE "imports" ALTER COLUMN "target_region_id" DROP NOT NULL;
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
   ALTER TABLE "imports" ALTER COLUMN "status" SET DATA TYPE text;
  UPDATE "imports" SET "status" = 'partial' WHERE "status" = 'review';
  ALTER TABLE "imports" ALTER COLUMN "status" SET DEFAULT 'pending'::text;
  DROP TYPE "public"."enum_imports_status";
  CREATE TYPE "public"."enum_imports_status" AS ENUM('pending', 'completed', 'partial', 'failed');
  ALTER TABLE "imports" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."enum_imports_status";
  ALTER TABLE "imports" ALTER COLUMN "status" SET DATA TYPE "public"."enum_imports_status" USING "status"::"public"."enum_imports_status";
  ALTER TABLE "imports" ALTER COLUMN "target_region_id" SET NOT NULL;
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
