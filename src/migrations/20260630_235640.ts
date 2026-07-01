import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_config_rels" ADD COLUMN "audiences_id" integer;
  ALTER TABLE "wm_web_config_rels" ADD CONSTRAINT "wm_web_config_rels_audiences_fk" FOREIGN KEY ("audiences_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "wm_web_config_rels_audiences_id_idx" ON "wm_web_config_rels" USING btree ("audiences_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_config_rels" DROP CONSTRAINT "wm_web_config_rels_audiences_fk";
  
  DROP INDEX "wm_web_config_rels_audiences_id_idx";
  ALTER TABLE "wm_web_config_rels" DROP COLUMN "audiences_id";`)
}
