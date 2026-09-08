import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_wm_web_config_available_locales" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_sy_atlas_config_available_locales" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TABLE "wm_web_config_available_locales" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_wm_web_config_available_locales",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "sy_atlas_config_available_locales" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_sy_atlas_config_available_locales",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "sy_atlas_config_languages" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "sy_atlas_config_languages" CASCADE;
  DROP INDEX "wm_web_translations__status_idx";
  DROP INDEX "_wm_web_translations_v_version_version__status_idx";
  DROP INDEX "sy_atlas_translations__status_idx";
  DROP INDEX "_sy_atlas_translations_v_version_version__status_idx";
  ALTER TABLE "songs" ALTER COLUMN "file_metadata" SET DEFAULT '{}'::jsonb;
  ALTER TABLE "images" ALTER COLUMN "file_metadata" SET DEFAULT '{}'::jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "_status" "enum_wm_web_translations_status" DEFAULT 'draft';
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version__status" "enum__wm_web_translations_v_version_status" DEFAULT 'draft';
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "_status" "enum_sy_atlas_translations_status" DEFAULT 'draft';
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version__status" "enum__sy_atlas_translations_v_version_status" DEFAULT 'draft';
  ALTER TABLE "wm_web_config_available_locales" ADD CONSTRAINT "wm_web_config_available_locales_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wm_web_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sy_atlas_config_available_locales" ADD CONSTRAINT "sy_atlas_config_available_locales_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sy_atlas_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "wm_web_config_available_locales_order_idx" ON "wm_web_config_available_locales" USING btree ("order");
  CREATE INDEX "wm_web_config_available_locales_parent_idx" ON "wm_web_config_available_locales" USING btree ("parent_id");
  CREATE INDEX "sy_atlas_config_available_locales_order_idx" ON "sy_atlas_config_available_locales" USING btree ("order");
  CREATE INDEX "sy_atlas_config_available_locales_parent_idx" ON "sy_atlas_config_available_locales" USING btree ("parent_id");
  CREATE INDEX "wm_web_translations__status_idx" ON "wm_web_translations_locales" USING btree ("_status","_locale");
  CREATE INDEX "_wm_web_translations_v_version_version__status_idx" ON "_wm_web_translations_v_locales" USING btree ("version__status","_locale");
  CREATE INDEX "sy_atlas_translations__status_idx" ON "sy_atlas_translations_locales" USING btree ("_status","_locale");
  CREATE INDEX "_sy_atlas_translations_v_version_version__status_idx" ON "_sy_atlas_translations_v_locales" USING btree ("version__status","_locale");
  ALTER TABLE "wm_web_translations" DROP COLUMN "_status";
  ALTER TABLE "_wm_web_translations_v" DROP COLUMN "version__status";
  ALTER TABLE "sy_atlas_translations" DROP COLUMN "_status";
  ALTER TABLE "_sy_atlas_translations_v" DROP COLUMN "version__status";
  DROP TYPE "public"."enum_sy_atlas_config_languages_code";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sy_atlas_config_languages_code" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TABLE "sy_atlas_config_languages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"code" "enum_sy_atlas_config_languages_code" NOT NULL
  );
  
  ALTER TABLE "wm_web_config_available_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sy_atlas_config_available_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "wm_web_config_available_locales" CASCADE;
  DROP TABLE "sy_atlas_config_available_locales" CASCADE;
  DROP INDEX "wm_web_translations__status_idx";
  DROP INDEX "_wm_web_translations_v_version_version__status_idx";
  DROP INDEX "sy_atlas_translations__status_idx";
  DROP INDEX "_sy_atlas_translations_v_version_version__status_idx";
  ALTER TABLE "songs" ALTER COLUMN "file_metadata" DROP DEFAULT;
  ALTER TABLE "images" ALTER COLUMN "file_metadata" DROP DEFAULT;
  ALTER TABLE "wm_web_translations" ADD COLUMN "_status" "enum_wm_web_translations_status" DEFAULT 'draft';
  ALTER TABLE "_wm_web_translations_v" ADD COLUMN "version__status" "enum__wm_web_translations_v_version_status" DEFAULT 'draft';
  ALTER TABLE "sy_atlas_translations" ADD COLUMN "_status" "enum_sy_atlas_translations_status" DEFAULT 'draft';
  ALTER TABLE "_sy_atlas_translations_v" ADD COLUMN "version__status" "enum__sy_atlas_translations_v_version_status" DEFAULT 'draft';
  ALTER TABLE "sy_atlas_config_languages" ADD CONSTRAINT "sy_atlas_config_languages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sy_atlas_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sy_atlas_config_languages_order_idx" ON "sy_atlas_config_languages" USING btree ("_order");
  CREATE INDEX "sy_atlas_config_languages_parent_id_idx" ON "sy_atlas_config_languages" USING btree ("_parent_id");
  CREATE INDEX "wm_web_translations__status_idx" ON "wm_web_translations" USING btree ("_status");
  CREATE INDEX "_wm_web_translations_v_version_version__status_idx" ON "_wm_web_translations_v" USING btree ("version__status");
  CREATE INDEX "sy_atlas_translations__status_idx" ON "sy_atlas_translations" USING btree ("_status");
  CREATE INDEX "_sy_atlas_translations_v_version_version__status_idx" ON "_sy_atlas_translations_v" USING btree ("version__status");
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "_status";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version__status";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "_status";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version__status";
  DROP TYPE "public"."enum_wm_web_config_available_locales";
  DROP TYPE "public"."enum_sy_atlas_config_available_locales";`)
}
