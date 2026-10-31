import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_registration_refusals_stage" AS ENUM('request', 'screening');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'sendRefusedRegistrationDigests' BEFORE 'sendRegistrationDigests';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'sendRefusedRegistrationDigests' BEFORE 'sendRegistrationDigests';
  CREATE TABLE "registration_refusals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" integer,
  	"stage" "enum_registration_refusals_stage" NOT NULL,
  	"reason" varchar NOT NULL,
  	"hour" timestamp(3) with time zone,
  	"count" numeric DEFAULT 1 NOT NULL,
  	"submission_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "managers" ALTER COLUMN "notification_preferences" SET DEFAULT '{"invitation":{"frequency":"Immediate","method":"email"},"event_verification":{"frequency":"Monthly","method":"email"},"event_registration":{"frequency":"Immediate","method":"email"},"regional_summary":{"frequency":"Monthly","method":"email"},"refused_registrations":{"frequency":"Daily Summary","method":"email"}}'::jsonb;
  ALTER TABLE "managers" ADD COLUMN "last_refused_registration_digest_sent_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "registration_refusals_id" integer;
  ALTER TABLE "registration_refusals" ADD CONSTRAINT "registration_refusals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "registration_refusals" ADD CONSTRAINT "registration_refusals_submission_id_user_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."user_submissions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "registration_refusals_event_idx" ON "registration_refusals" USING btree ("event_id");
  CREATE INDEX "registration_refusals_submission_idx" ON "registration_refusals" USING btree ("submission_id");
  CREATE INDEX "registration_refusals_updated_at_idx" ON "registration_refusals" USING btree ("updated_at");
  CREATE INDEX "registration_refusals_created_at_idx" ON "registration_refusals" USING btree ("created_at");
  CREATE UNIQUE INDEX "event_reason_hour_idx" ON "registration_refusals" USING btree ("event_id","reason","hour");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_registration_refusals_fk" FOREIGN KEY ("registration_refusals_id") REFERENCES "public"."registration_refusals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_registration_refusals_id_idx" ON "payload_locked_documents_rels" USING btree ("registration_refusals_id");
  UPDATE "managers"
    SET "notification_preferences" = COALESCE("notification_preferences", '{}'::jsonb)
      || '{"refused_registrations":{"frequency":"Daily Summary","method":"email"}}'::jsonb
    WHERE NOT (COALESCE("notification_preferences", '{}'::jsonb) ? 'refused_registrations');`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "registration_refusals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "registration_refusals" CASCADE;
  
  DELETE FROM "payload_jobs_log" WHERE "task_slug" = 'sendRefusedRegistrationDigests';
  DELETE FROM "payload_jobs" WHERE "task_slug" = 'sendRefusedRegistrationDigests';
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'cleanupCollections', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'cleanupCollections', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_registration_refusals_id_idx";
  ALTER TABLE "managers" ALTER COLUMN "notification_preferences" SET DEFAULT '{"invitation":{"frequency":"Immediate","method":"email"},"event_verification":{"frequency":"Monthly","method":"email"},"event_registration":{"frequency":"Immediate","method":"email"},"regional_summary":{"frequency":"Monthly","method":"email"}}'::jsonb;
  UPDATE "managers" SET "notification_preferences" = "notification_preferences" - 'refused_registrations';
  ALTER TABLE "managers" DROP COLUMN "last_refused_registration_digest_sent_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "registration_refusals_id";
  DROP TYPE "public"."enum_registration_refusals_stage";`)
}
