import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "parent_id" integer;
  ALTER TABLE "_pages_v" ADD COLUMN "version_parent_id" integer;
  ALTER TABLE "wm_web_config" ADD COLUMN "index_pages_meditations_id" integer;
  ALTER TABLE "wm_web_config" ADD COLUMN "index_pages_lectures_id" integer;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_parent_id_pages_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_web_config" ADD CONSTRAINT "wm_web_config_index_pages_meditations_id_pages_id_fk" FOREIGN KEY ("index_pages_meditations_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_web_config" ADD CONSTRAINT "wm_web_config_index_pages_lectures_id_pages_id_fk" FOREIGN KEY ("index_pages_lectures_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_parent_idx" ON "pages" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_parent_idx" ON "_pages_v" USING btree ("version_parent_id");
  CREATE INDEX "wm_web_config_index_pages_index_pages_meditations_idx" ON "wm_web_config" USING btree ("index_pages_meditations_id");
  CREATE INDEX "wm_web_config_index_pages_index_pages_lectures_idx" ON "wm_web_config" USING btree ("index_pages_lectures_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP CONSTRAINT "pages_parent_id_pages_id_fk";
  
  ALTER TABLE "_pages_v" DROP CONSTRAINT "_pages_v_version_parent_id_pages_id_fk";
  
  ALTER TABLE "wm_web_config" DROP CONSTRAINT "wm_web_config_index_pages_meditations_id_pages_id_fk";
  
  ALTER TABLE "wm_web_config" DROP CONSTRAINT "wm_web_config_index_pages_lectures_id_pages_id_fk";
  
  DROP INDEX "pages_parent_idx";
  DROP INDEX "_pages_v_version_version_parent_idx";
  DROP INDEX "wm_web_config_index_pages_index_pages_meditations_idx";
  DROP INDEX "wm_web_config_index_pages_index_pages_lectures_idx";
  ALTER TABLE "pages" DROP COLUMN "parent_id";
  ALTER TABLE "_pages_v" DROP COLUMN "version_parent_id";
  ALTER TABLE "wm_web_config" DROP COLUMN "index_pages_meditations_id";
  ALTER TABLE "wm_web_config" DROP COLUMN "index_pages_lectures_id";`)
}
