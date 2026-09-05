import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_event_submissions_languages" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_event_submissions_schedule_weekdays" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum_event_submissions_event_type" AS ENUM('offline', 'online');
  CREATE TYPE "public"."enum_event_submissions_schedule_type" AS ENUM('one-off', 'weekly');
  CREATE TYPE "public"."enum_event_submissions_status" AS ENUM('screening', 'pending', 'spam', 'created', 'updated', 'rejected');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'screenEventSubmission' BEFORE 'sendRegistrationDigests';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'screenEventSubmission' BEFORE 'sendRegistrationDigests';
  CREATE TABLE "event_submissions_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_event_submissions_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "event_submissions_schedule_weekdays" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_event_submissions_schedule_weekdays",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "event_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" integer,
  	"submitter_name" varchar NOT NULL,
  	"submitter_email" varchar NOT NULL,
  	"submitter_note" varchar,
  	"event_type" "enum_event_submissions_event_type",
  	"online_url" varchar,
  	"address_mapbox_id" varchar,
  	"address_venue_name" varchar,
  	"address_street" varchar,
  	"address_room" varchar,
  	"address_post_code" varchar,
  	"address_country" varchar,
  	"address_region" varchar,
  	"address_city" varchar,
  	"address_latitude" numeric,
  	"address_longitude" numeric,
  	"contact_name" varchar,
  	"contact_email" varchar,
  	"contact_phone" varchar,
  	"description" varchar,
  	"schedule_schedule_type" "enum_event_submissions_schedule_type",
  	"schedule_start_date" timestamp(3) with time zone,
  	"schedule_end_date" timestamp(3) with time zone,
  	"schedule_start_time" varchar,
  	"schedule_end_time" varchar,
  	"schedule_timezone" varchar,
  	"country_id" integer,
  	"state_id" integer,
  	"anchor_region_id" integer,
  	"region_id" integer,
  	"submitter_id" integer,
  	"status" "enum_event_submissions_status" DEFAULT 'screening' NOT NULL,
  	"screening_result" jsonb,
  	"reviewed_by_id" integer,
  	"reviewed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "event_submissions_id" integer;
  ALTER TABLE "event_submissions_languages" ADD CONSTRAINT "event_submissions_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_submissions_schedule_weekdays" ADD CONSTRAINT "event_submissions_schedule_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_country_id_regions_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_state_id_regions_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_anchor_region_id_regions_id_fk" FOREIGN KEY ("anchor_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_reviewed_by_id_managers_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "event_submissions_languages_order_idx" ON "event_submissions_languages" USING btree ("order");
  CREATE INDEX "event_submissions_languages_parent_idx" ON "event_submissions_languages" USING btree ("parent_id");
  CREATE INDEX "event_submissions_schedule_weekdays_order_idx" ON "event_submissions_schedule_weekdays" USING btree ("order");
  CREATE INDEX "event_submissions_schedule_weekdays_parent_idx" ON "event_submissions_schedule_weekdays" USING btree ("parent_id");
  CREATE INDEX "event_submissions_event_idx" ON "event_submissions" USING btree ("event_id");
  CREATE INDEX "event_submissions_country_idx" ON "event_submissions" USING btree ("country_id");
  CREATE INDEX "event_submissions_state_idx" ON "event_submissions" USING btree ("state_id");
  CREATE INDEX "event_submissions_anchor_region_idx" ON "event_submissions" USING btree ("anchor_region_id");
  CREATE INDEX "event_submissions_region_idx" ON "event_submissions" USING btree ("region_id");
  CREATE INDEX "event_submissions_submitter_idx" ON "event_submissions" USING btree ("submitter_id");
  CREATE INDEX "event_submissions_reviewed_by_idx" ON "event_submissions" USING btree ("reviewed_by_id");
  CREATE INDEX "event_submissions_updated_at_idx" ON "event_submissions" USING btree ("updated_at");
  CREATE INDEX "event_submissions_created_at_idx" ON "event_submissions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_event_submissions_fk" FOREIGN KEY ("event_submissions_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_event_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("event_submissions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "event_submissions_languages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_submissions_schedule_weekdays" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_submissions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "event_submissions_languages" CASCADE;
  DROP TABLE "event_submissions_schedule_weekdays" CASCADE;
  DROP TABLE "event_submissions" CASCADE;
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_event_submissions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "event_submissions_id";
  DROP TYPE "public"."enum_event_submissions_languages";
  DROP TYPE "public"."enum_event_submissions_schedule_weekdays";
  DROP TYPE "public"."enum_event_submissions_event_type";
  DROP TYPE "public"."enum_event_submissions_schedule_type";
  DROP TYPE "public"."enum_event_submissions_status";`)
}
