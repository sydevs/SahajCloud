import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_exports_format" AS ENUM('csv', 'json');
  CREATE TYPE "public"."enum_exports_sort_order" AS ENUM('asc', 'desc');
  CREATE TYPE "public"."enum_exports_locale" AS ENUM('all', 'en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_exports_drafts" AS ENUM('yes', 'no');
  CREATE TYPE "public"."enum_imports_default_languages" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_imports_import_mode" AS ENUM('create', 'update', 'upsert');
  CREATE TYPE "public"."enum_imports_status" AS ENUM('pending', 'completed', 'partial', 'failed');
  CREATE TABLE "exports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"format" "enum_exports_format" DEFAULT 'csv' NOT NULL,
  	"limit" numeric,
  	"page" numeric DEFAULT 1,
  	"sort" varchar,
  	"sort_order" "enum_exports_sort_order",
  	"locale" "enum_exports_locale" DEFAULT 'all',
  	"drafts" "enum_exports_drafts" DEFAULT 'yes',
  	"collection_slug" varchar NOT NULL,
  	"where" jsonb DEFAULT '{}'::jsonb,
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
  
  CREATE TABLE "exports_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "imports_default_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_imports_default_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"target_region_id" integer NOT NULL,
  	"manager_id" integer NOT NULL,
  	"locale" varchar,
  	"skipped_rows" jsonb,
  	"collection_slug" varchar DEFAULT 'events' NOT NULL,
  	"import_mode" "enum_imports_import_mode",
  	"match_field" varchar DEFAULT 'id',
  	"status" "enum_imports_status" DEFAULT 'pending',
  	"summary_imported" numeric,
  	"summary_updated" numeric,
  	"summary_total" numeric,
  	"summary_issues" numeric,
  	"summary_issue_details" jsonb,
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
  
  ALTER TABLE "event_imports_default_languages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_imports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "event_imports_default_languages" CASCADE;
  DROP TABLE "event_imports" CASCADE;
  -- No DROP CONSTRAINT for payload_locked_documents_rels_event_imports_fk:
  -- CASCADE above takes it with the table it references, so dropping it again
  -- aborts the boot migration. migrate:create emits that statement anyway.
  
  -- Rows naming a task slug the new enum lacks would fail the cast below. The
  -- superseded import tasks are the only such slugs, and their jobs are dead.
  DELETE FROM "payload_jobs_log" WHERE "task_slug" IN ('analyzeEventImport', 'commitEventImport', 'resolveEventImport');
  DELETE FROM "payload_jobs" WHERE "task_slug" IN ('analyzeEventImport', 'commitEventImport', 'resolveEventImport');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupJobs', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'sweepEventImports', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'createCollectionExport', 'createCollectionImport', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupJobs', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'sweepEventImports', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'createCollectionExport', 'createCollectionImport', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "events_import_key_idx";
  DROP INDEX "_events_v_version_version_import_key_idx";
  DROP INDEX "payload_locked_documents_rels_event_imports_id_idx";
  ALTER TABLE "events" ADD COLUMN "import_batch_id" integer;
  ALTER TABLE "_events_v" ADD COLUMN "version_import_batch_id" integer;
  ALTER TABLE "exports_texts" ADD CONSTRAINT "exports_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "imports_default_languages" ADD CONSTRAINT "imports_default_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "imports" ADD CONSTRAINT "imports_target_region_id_regions_id_fk" FOREIGN KEY ("target_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "imports" ADD CONSTRAINT "imports_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "exports_updated_at_idx" ON "exports" USING btree ("updated_at");
  CREATE INDEX "exports_created_at_idx" ON "exports" USING btree ("created_at");
  CREATE UNIQUE INDEX "exports_filename_idx" ON "exports" USING btree ("filename");
  CREATE INDEX "exports_texts_order_parent" ON "exports_texts" USING btree ("order","parent_id");
  CREATE INDEX "imports_default_languages_order_idx" ON "imports_default_languages" USING btree ("order");
  CREATE INDEX "imports_default_languages_parent_idx" ON "imports_default_languages" USING btree ("parent_id");
  CREATE INDEX "imports_target_region_idx" ON "imports" USING btree ("target_region_id");
  CREATE INDEX "imports_manager_idx" ON "imports" USING btree ("manager_id");
  CREATE INDEX "imports_updated_at_idx" ON "imports" USING btree ("updated_at");
  CREATE INDEX "imports_created_at_idx" ON "imports" USING btree ("created_at");
  CREATE UNIQUE INDEX "imports_filename_idx" ON "imports" USING btree ("filename");
  ALTER TABLE "events" ADD CONSTRAINT "events_import_batch_id_imports_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_import_batch_id_imports_id_fk" FOREIGN KEY ("version_import_batch_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "events_import_batch_idx" ON "events" USING btree ("import_batch_id");
  CREATE INDEX "_events_v_version_version_import_batch_idx" ON "_events_v" USING btree ("version_import_batch_id");
  ALTER TABLE "events" DROP COLUMN "import_key";
  ALTER TABLE "_events_v" DROP COLUMN "version_import_key";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "event_imports_id";
  DROP TYPE "public"."enum_event_imports_default_languages";
  DROP TYPE "public"."enum_event_imports_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
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
  
  ALTER TABLE "exports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "exports_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "imports_default_languages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "imports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "exports" CASCADE;
  DROP TABLE "exports_texts" CASCADE;
  DROP TABLE "imports_default_languages" CASCADE;
  DROP TABLE "imports" CASCADE;
  
  DELETE FROM "payload_jobs_log" WHERE "task_slug" IN ('createCollectionImport', 'createCollectionExport');
  DELETE FROM "payload_jobs" WHERE "task_slug" IN ('createCollectionImport', 'createCollectionExport');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'analyzeEventImport', 'cleanupOrphanedMedia', 'commitEventImport', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'sweepEventImports', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'analyzeEventImport', 'cleanupOrphanedMedia', 'commitEventImport', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'sweepEventImports', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "events_import_batch_idx";
  DROP INDEX "_events_v_version_version_import_batch_idx";
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
  CREATE INDEX "payload_locked_documents_rels_event_imports_id_idx" ON "payload_locked_documents_rels" USING btree ("event_imports_id");
  ALTER TABLE "events" DROP COLUMN "import_batch_id";
  ALTER TABLE "_events_v" DROP COLUMN "version_import_batch_id";
  DROP TYPE "public"."enum_exports_format";
  DROP TYPE "public"."enum_exports_sort_order";
  DROP TYPE "public"."enum_exports_locale";
  DROP TYPE "public"."enum_exports_drafts";
  DROP TYPE "public"."enum_imports_default_languages";
  DROP TYPE "public"."enum_imports_import_mode";
  DROP TYPE "public"."enum_imports_status";`)
}
