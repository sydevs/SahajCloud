import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_wm_app_config_available_locales" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TABLE "wm_app_config_available_locales" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_wm_app_config_available_locales",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  DROP INDEX "wm_app_translations__status_idx";
  DROP INDEX "_wm_app_translations_v_version_version__status_idx";
  ALTER TABLE "wm_app_translations_locales" ADD COLUMN "_status" "enum_wm_app_translations_status" DEFAULT 'draft';
  ALTER TABLE "_wm_app_translations_v_locales" ADD COLUMN "version__status" "enum__wm_app_translations_v_version_status" DEFAULT 'draft';
  ALTER TABLE "wm_app_config_available_locales" ADD CONSTRAINT "wm_app_config_available_locales_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wm_app_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "wm_app_config_available_locales_order_idx" ON "wm_app_config_available_locales" USING btree ("order");
  CREATE INDEX "wm_app_config_available_locales_parent_idx" ON "wm_app_config_available_locales" USING btree ("parent_id");
  CREATE INDEX "wm_app_translations__status_idx" ON "wm_app_translations_locales" USING btree ("_status","_locale");
  CREATE INDEX "_wm_app_translations_v_version_version__status_idx" ON "_wm_app_translations_v_locales" USING btree ("version__status","_locale");
  ALTER TABLE "wm_app_translations" DROP COLUMN "_status";
  ALTER TABLE "_wm_app_translations_v" DROP COLUMN "version__status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_app_config_available_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "wm_app_config_available_locales" CASCADE;
  DROP INDEX "wm_app_translations__status_idx";
  DROP INDEX "_wm_app_translations_v_version_version__status_idx";
  ALTER TABLE "wm_app_translations" ADD COLUMN "_status" "enum_wm_app_translations_status" DEFAULT 'draft';
  ALTER TABLE "_wm_app_translations_v" ADD COLUMN "version__status" "enum__wm_app_translations_v_version_status" DEFAULT 'draft';
  CREATE INDEX "wm_app_translations__status_idx" ON "wm_app_translations" USING btree ("_status");
  CREATE INDEX "_wm_app_translations_v_version_version__status_idx" ON "_wm_app_translations_v" USING btree ("version__status");
  ALTER TABLE "wm_app_translations_locales" DROP COLUMN "_status";
  ALTER TABLE "_wm_app_translations_v_locales" DROP COLUMN "version__status";
  DROP TYPE "public"."enum_wm_app_config_available_locales";`)
}
