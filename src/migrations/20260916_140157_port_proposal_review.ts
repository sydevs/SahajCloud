import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_submissions" ADD COLUMN "manager_id" integer;
  ALTER TABLE "user_submissions" ADD COLUMN "region_id" integer;
  ALTER TABLE "user_submissions" ADD COLUMN "region_hint" jsonb;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "user_submissions_manager_idx" ON "user_submissions" USING btree ("manager_id");
  CREATE INDEX "user_submissions_region_idx" ON "user_submissions" USING btree ("region_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_submissions" DROP CONSTRAINT "user_submissions_manager_id_managers_id_fk";
  
  ALTER TABLE "user_submissions" DROP CONSTRAINT "user_submissions_region_id_regions_id_fk";
  
  DROP INDEX "user_submissions_manager_idx";
  DROP INDEX "user_submissions_region_idx";
  ALTER TABLE "user_submissions" DROP COLUMN "manager_id";
  ALTER TABLE "user_submissions" DROP COLUMN "region_id";
  ALTER TABLE "user_submissions" DROP COLUMN "region_hint";`)
}
