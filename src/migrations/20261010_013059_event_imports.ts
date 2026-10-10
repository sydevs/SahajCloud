import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_event_imports_default_languages" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_event_imports_status" AS ENUM('resolving', 'review', 'committing', 'finished', 'failed', 'discarded');
  CREATE TABLE "event_imports_default_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_event_imports_default_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "event_imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"target_region_id" integer NOT NULL,
  	"manager_id" integer NOT NULL,
  	"status" "enum_event_imports_status" DEFAULT 'resolving' NOT NULL,
  	"progress_done" numeric,
  	"progress_total" numeric,
  	"progress_note" varchar,
  	"rows" jsonb,
  	"proposed_regions" jsonb,
  	"report" jsonb,
  	"error" varchar,
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "events" ADD COLUMN "import_key" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_import_key" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "event_imports_id" integer;
  ALTER TABLE "event_imports_default_languages" ADD CONSTRAINT "event_imports_default_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_imports" ADD CONSTRAINT "event_imports_target_region_id_regions_id_fk" FOREIGN KEY ("target_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_imports" ADD CONSTRAINT "event_imports_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "event_imports_default_languages_order_idx" ON "event_imports_default_languages" USING btree ("order");
  CREATE INDEX "event_imports_default_languages_parent_idx" ON "event_imports_default_languages" USING btree ("parent_id");
  CREATE INDEX "event_imports_target_region_idx" ON "event_imports" USING btree ("target_region_id");
  CREATE INDEX "event_imports_manager_idx" ON "event_imports" USING btree ("manager_id");
  CREATE INDEX "event_imports_updated_at_idx" ON "event_imports" USING btree ("updated_at");
  CREATE INDEX "event_imports_created_at_idx" ON "event_imports" USING btree ("created_at");
  CREATE UNIQUE INDEX "event_imports_filename_idx" ON "event_imports" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_event_imports_fk" FOREIGN KEY ("event_imports_id") REFERENCES "public"."event_imports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "events_import_key_idx" ON "events" USING btree ("import_key");
  CREATE INDEX "_events_v_version_version_import_key_idx" ON "_events_v" USING btree ("version_import_key");
  CREATE INDEX "payload_locked_documents_rels_event_imports_id_idx" ON "payload_locked_documents_rels" USING btree ("event_imports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "event_imports_default_languages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_imports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "event_imports_default_languages" CASCADE;
  DROP TABLE "event_imports" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_event_imports_fk";
  
  DROP INDEX "events_import_key_idx";
  DROP INDEX "_events_v_version_version_import_key_idx";
  DROP INDEX "payload_locked_documents_rels_event_imports_id_idx";
  ALTER TABLE "events" DROP COLUMN "import_key";
  ALTER TABLE "_events_v" DROP COLUMN "version_import_key";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "event_imports_id";
  DROP TYPE "public"."enum_event_imports_default_languages";
  DROP TYPE "public"."enum_event_imports_status";`)
}
