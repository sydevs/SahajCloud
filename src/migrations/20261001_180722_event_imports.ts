import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_event_imports_default_languages" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_event_imports_status" AS ENUM('uploaded', 'resolved', 'committing');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'purgeEventImports' BEFORE 'purgeSubmissions';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'purgeEventImports' BEFORE 'purgeSubmissions';
  CREATE TABLE "event_imports_default_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_event_imports_default_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "event_imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"target_region_id" integer NOT NULL,
  	"uploader_id" integer NOT NULL,
  	"status" "enum_event_imports_status" DEFAULT 'uploaded' NOT NULL,
  	"rows" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "event_imports_id" integer;
  ALTER TABLE "event_imports_default_languages" ADD CONSTRAINT "event_imports_default_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_imports" ADD CONSTRAINT "event_imports_target_region_id_regions_id_fk" FOREIGN KEY ("target_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_imports" ADD CONSTRAINT "event_imports_uploader_id_managers_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "event_imports_default_languages_order_idx" ON "event_imports_default_languages" USING btree ("order");
  CREATE INDEX "event_imports_default_languages_parent_idx" ON "event_imports_default_languages" USING btree ("parent_id");
  CREATE INDEX "event_imports_target_region_idx" ON "event_imports" USING btree ("target_region_id");
  CREATE INDEX "event_imports_uploader_idx" ON "event_imports" USING btree ("uploader_id");
  CREATE INDEX "event_imports_updated_at_idx" ON "event_imports" USING btree ("updated_at");
  CREATE INDEX "event_imports_created_at_idx" ON "event_imports" USING btree ("created_at");
  CREATE INDEX "event_imports_deleted_at_idx" ON "event_imports" USING btree ("deleted_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_event_imports_fk" FOREIGN KEY ("event_imports_id") REFERENCES "public"."event_imports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_event_imports_id_idx" ON "payload_locked_documents_rels" USING btree ("event_imports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "event_imports_default_languages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_imports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "event_imports_default_languages" CASCADE;
  DROP TABLE "event_imports" CASCADE;

  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_event_imports_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "event_imports_id";
  DROP TYPE "public"."enum_event_imports_default_languages";
  DROP TYPE "public"."enum_event_imports_status";`)
}
