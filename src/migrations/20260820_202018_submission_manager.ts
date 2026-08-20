import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "event_submissions" ADD COLUMN "manager_id" integer;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "event_submissions_manager_idx" ON "event_submissions" USING btree ("manager_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "event_submissions" DROP CONSTRAINT "event_submissions_manager_id_managers_id_fk";
  
  DROP INDEX "event_submissions_manager_idx";
  ALTER TABLE "event_submissions" DROP COLUMN "manager_id";`)
}
