import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_config" ADD COLUMN "report_issue_form_id" integer;
  ALTER TABLE "sy_atlas_config" ADD CONSTRAINT "sy_atlas_config_report_issue_form_id_forms_id_fk" FOREIGN KEY ("report_issue_form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "sy_atlas_config_report_issue_form_idx" ON "sy_atlas_config" USING btree ("report_issue_form_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_config" DROP CONSTRAINT "sy_atlas_config_report_issue_form_id_forms_id_fk";
  
  DROP INDEX "sy_atlas_config_report_issue_form_idx";
  ALTER TABLE "sy_atlas_config" DROP COLUMN "report_issue_form_id";`)
}
